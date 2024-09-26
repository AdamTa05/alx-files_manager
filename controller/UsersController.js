import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

export function hashPassword(password) {
  const sha1 = crypto.createHash('sha1');
  sha1.update(password);
  return sha1.digest('hex');
}

class UsersControllers {
  async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });

    const user = await dbClient.db.collection('users').findOne({ email });
    if (user) return res.status(400).send({ error: 'Already exist' });
    const hashedPass = hashPassword(password);
    const newUser = await dbClient.db.collection('users').insertOne({ email, password: hashedPass });
    return res.status(200).send({ id: newUser.insertedId, email: newUser.ops[0].email });
  }

  async getMe(req, res) {
    const tokenHeader = req.headers['x-token'];
    // Get the user id from redis store using token as key
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    console.log(userId);
    // Get the user from the database using the user id
    const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
    // res.status(401).send({ error: 'Unauthorized' }); // if user not found
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    // Return the user
    return res.status(200).send(user);
  }
}

const userController = new UsersControllers();
export default userController;
