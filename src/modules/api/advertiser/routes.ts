import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { AdvertiserController } from '../../../controllers/AdvertiserController';
import { authMiddleware } from '../../../middleware/auth';

const advertiserRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new AdvertiserController();

advertiserRoutes.use('*', authMiddleware({ required: true }));

advertiserRoutes.get('/dashboard', async (c) => controller.getDashboard(c));
advertiserRoutes.post('/campaigns', async (c) => controller.createCampaign(c));
advertiserRoutes.put('/campaigns/:id/pause', async (c) => controller.pauseCampaign(c));
advertiserRoutes.put('/campaigns/:id/resume', async (c) => controller.resumeCampaign(c));
advertiserRoutes.get('/campaigns/:id/analytics', async (c) => controller.getCampaignAnalytics(c));

export default advertiserRoutes;
