import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import mime from 'mime-types';

class FilesController {
	constructor() {
		const { FOLDER_PATH = "/tmp/files_manager" } = process.env;
		this.FOLDER_PATH = FOLDER_PATH;
	}

	async postUpload(req, res) {
		const tokenHeader = req.headers["x-token"];
		const userId = await redisClient.get(`auth_${tokenHeader}`);
		const user = await dbClient.db
			.collection("users")
			.findOne({ _id: new ObjectId(userId) });
		if (!user) return res.status(401).send({ error: "Unauthorized" });
		const { name, type, parentId, isPublic, data } = req.body;
		const acceptedTypes = ["folder", "file", "image"];
		if (!name) return res.status(401).send({ error: "Missing name" });
		if (!type || !acceptedTypes.includes(type))
			return res.status(401).send({ error: "Missing type" });
		if (!data && type !== acceptedTypes[0])
			return res.status(401).send({ error: "Missing data" });
		if (parentId) {
			const parent = await dbClient.db
				.collection("files")
				.findOne({ _id: new ObjectId(parentId) });
			if (!parent)
				return res.status(401).send({ error: "Parent not found" });
			if (parent.type !== acceptedTypes[0])
				return res
					.status(401)
					.send({ error: "Parent is not a folder" });
			if (parent.userId !== user._id.toString())
				return res.status(401).send({ error: "Unauthorized" });
		}
		if (type === acceptedTypes[0]) {
			const newFolder = await dbClient.db.collection("files").insertOne({
				name,
				type,
				parentId: parentId || 0,
				isPublic: isPublic || false,
				userId: user._id.toString()
				// createdAt: new Date(),
				// updatedAt: new Date(),
			});
			return res.status(201).send(newFolder.ops[0]);
		}
		const path = `${this.FOLDER_PATH}/${uuidv4()}`;
		/* eslint-disable no-undef */
		// const decodedData = atob(data);
		const decodedData = Buffer.from(data, "base64");
		/* eslint-disable no-undef */
		fs.mkdirSync(this.FOLDER_PATH, { recursive: true });
		await fs.writeFileSync(path, decodedData);
		const newFile = await dbClient.db.collection("files").insertOne({
			name,
			type,
			isPublic: isPublic || false,
			parentId: parentId || 0,
			localPath: path,
			userId: user._id.toString()
		});
		return res.status(201).send(newFile.ops[0]);
	}

	async getShow(req, res) {
		const tokenHeader = req.headers["x-token"];
		const userId = await redisClient.get(`auth_${tokenHeader}`);
		const user = await dbClient.db
			.collection("users")
			.findOne({ _id: new ObjectId(userId) });
		if (!user) return res.status(401).send({ error: "Unauthorized" });
		const { id } = req.params;
		const file = await dbClient.db
			.collection("files")
			.findOne({ _id: new ObjectId(id) });
		if (!file || (file && file.userId !== user._id.toString()))
			return res.status(404).send({ error: "Not found" });
		return res.status(200).send(file);
	}

	async getIndex(req, res) {
		const tokenHeader = req.headers["x-token"];
		const userId = await redisClient.get(`auth_${tokenHeader}`);
		const user = await dbClient.db
			.collection("users")
			.findOne({ _id: new ObjectId(userId) });
		if (!user) return res.status(401).send({ error: "Unauthorized" });
		const { parentId, page = 0 } = req.query;
		const limit = 20;
		const skip = page * limit;
		// const files = await dbClient.db.collection('files').find({ parentId })
		// .skip(skip).limit(limit).toArray();
		const files = await dbClient.db
			.collection("files")
			.aggregate([
				{ $match: { parentId } },
				{ $skip: skip },
				{ $limit: limit }
			])
			.toArray();
		return res.status(200).send(files);
	}

	async putPublish(req, res) {
		const tokenHeader = req.headers["x-token"];
		const userId = await redisClient.get(`auth_${tokenHeader}`);
		const user = await dbClient.db
			.collection("users")
			.findOne({ _id: new ObjectId(userId) });
		if (!user) return res.status(401).send({ error: "Unauthorized" });
		const { id } = req.params;
		const file = await dbClient.db
			.collection("files")
			.findOne({ _id: new ObjectId(id) });
		if (!file) return res.status(404).send({ error: "File not found" });
		file.isPublic = true;
		await dbClient.db
			.collection("files")
			.updateOne({ _id: new ObjectId(id) }, { $set: file });
		return res.status(200).send(file);
	}

	async putUnpublish(req, res) {
		const tokenHeader = req.headers["x-token"];
		const userId = await redisClient.get(`auth_${tokenHeader}`);
		const user = await dbClient.db
			.collection("users")
			.findOne({ _id: new ObjectId(userId) });
		if (!user) return res.status(401).send({ error: "Unauthorized" });
		const { id } = req.params;
		const file = await dbClient.db
			.collection("files")
			.findOne({ _id: new ObjectId(id) });
		if (!file) return res.status(404).send({ error: "File not found" });
		file.isPublic = false;
		await dbClient.db
			.collection("files")
			.updateOne({ _id: new ObjectId(id) }, { $set: file });
		return res.status(200).send(file);
	}

	async getFile(req, res) {
    try {
      const tokenHeader = req.headers["x-token"];
      
      const userId = await redisClient.get(`auth_${tokenHeader}`);
      const user = await dbClient.db
        .collection("users")
        .findOne({ _id: new ObjectId(userId) });
      
      const { id } = req.params;
      const file = await dbClient.db
			.collection("files")
			.findOne({ _id: new ObjectId(id) });
			
			if (!file) {
				return res.status(404).json({ error: "Not found" });
      }
      
			if (!file.isPublic && (user?._id.toString() !== file.userId || !tokenHeader)) {
				return res.status(404).json({ error: "Not authorized" });
      }

      
			if (file.type === "folder") {
				return res
					.status(400)
					.json({ error: "A folder doesn't have content" });
			}
			const contentType = mime.lookup(file.name);

			res.setHeader("Content-Type", contentType);
			fs.createReadStream(file.localPath).pipe(res);
		} catch (err) {
			return res.status(500).json({ error: "Internal server error" });
		}
  }
  
}

const filesController = new FilesController();
export default filesController;

// "X-Token: 12d212ee-c1de-43f7-86f5-a017a72d088b"
// files/64046e9d387cbac02c1773b7/data
