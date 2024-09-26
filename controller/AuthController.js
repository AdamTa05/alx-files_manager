import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { hashPassword } from './UsersController';

class AuthController {
  async getConnect(req, res) {
    const authHeader = req.headers.authorization;
    const basicAuth = authHeader.split(' ')[1];
    /* eslint-disable no-undef */
    const decodedString = atob(basicAuth);
    /* eslint-disable no-undef */
    const [email, password] = decodedString.split(':');
    const user = await dbClient.db.collection('users').findOne({ email });
    if (!user || hashPassword(password) !== user.password) return res.status(401).send({ error: 'Unauthorized' });
    const randomString = uuidv4();
    const key = `auth_${randomString}`;
    // Store the user id in redis store using key as key
    await redisClient.set(key, user._id.toString(), 86400);
    return res.status(200).send({ token: randomString });
  }

  async getDisconnect(req, res) {
    const tokenHeader = req.headers['x-token'];
    // Get the user id from redis store using token as key
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    // Delete the user id from redis store
    await redisClient.del(`auth_${tokenHeader}`);
    return res.status(204).send();
  }
}

const authController = new AuthController();
export default authController;
