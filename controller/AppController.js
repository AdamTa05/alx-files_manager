import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
//   constructor() {}

  getStatus(req, res) {
    if (dbClient.isAlive() && redisClient.isAlive()) {
      return res.status(200).send({ redis: true, db: true });
    } if (dbClient.isAlive() && !redisClient.isAlive()) {
      return res.status(500).send({ redis: false, db: true });
    }
    if (!dbClient.isAlive() && redisClient.isAlive()) {
      return res.status(500).send({ redis: true, db: false });
    }

    return res.status(500).send({ redis: false, db: false });
  }

  async getStats(req, res) {
    const nbUsers = await dbClient.nbUsers();
    const nbFiles = await dbClient.nbFiles();
    return res.status(200).send({ users: nbUsers, files: nbFiles });
  }
}
const appController = new AppController();
export default appController;
