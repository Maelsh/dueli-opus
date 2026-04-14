import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { ComplaintController } from '../../../controllers/AdvertiserController';
import { authMiddleware } from '../../../middleware/auth';

const complaintsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new ComplaintController();

complaintsRoutes.use('*', authMiddleware({ required: true }));

complaintsRoutes.post('/', async (c) => controller.submitComplaint(c));
complaintsRoutes.get('/my', async (c) => controller.getUserComplaints(c));
complaintsRoutes.get('/:id', async (c) => controller.trackComplaint(c));

export default complaintsRoutes;
