const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const dbClient = require('../utils/db');  // Your MongoDB client
const redisClient = require('../utils/redis');  // Your Redis client for user authentication
const { ObjectId } = require('mongodb');

// Helper function to get user from token
async function getUserFromToken(token) {
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return null;
  const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
  return user;
}

// POST /files logic
async function postUpload(req, res) {
  const token = req.header('X-Token');
  const user = await getUserFromToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, type, parentId = 0, isPublic = false, data } = req.body;

  // Validate input fields
  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (!['folder', 'file', 'image'].includes(type)) {
    return res.status(400).json({ error: 'Missing type' });
  }
  if (type !== 'folder' && !data) {
    return res.status(400).json({ error: 'Missing data' });
  }

  // Handle parentId validation
  if (parentId !== 0) {
    const parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
    if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
    if (parentFile.type !== 'folder') {
      return res.status(400).json({ error: 'Parent is not a folder' });
    }
  }

  const fileDocument = {
    userId: user._id.toString(),
    name,
    type,
    isPublic,
    parentId,
    localPath: null,
  };

  // If type is a folder, only add to DB
  if (type === 'folder') {
    await dbClient.db.collection('files').insertOne(fileDocument);
    return res.status(201).json(fileDocument);
  }

  // For files or images, create the file on disk and store metadata in DB
  const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const fileUuid = uuidv4();
  const filePath = path.join(folderPath, fileUuid);
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'));

  fileDocument.localPath = filePath;
  await dbClient.db.collection('files').insertOne(fileDocument);

  res.status(201).json(fileDocument);
}

module.exports = {
  postUpload,
};

