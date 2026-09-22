import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { AdvertiserController } from '../../../controllers/AdvertiserController';
import { authMiddleware } from '../../../middleware/auth';

const advertiserRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new AdvertiserController();

advertiserRoutes.use('*', authMiddleware({ required: true }));

advertiserRoutes.get('/dashboard', async (c) => controller.getDashboard(c));
advertiserRoutes.post('/campaigns', async (c) => controller.createCampaign(c));
advertiserRoutes.post('/campaigns/:id/submit-review', async (c) => controller.submitCampaign(c));
advertiserRoutes.put('/campaigns/:id/pause', async (c) => controller.pauseCampaign(c));
advertiserRoutes.put('/campaigns/:id/resume', async (c) => controller.resumeCampaign(c));
advertiserRoutes.put('/campaigns/:id/end', async (c) => controller.endCampaign(c));
advertiserRoutes.get('/campaigns/:id/analytics', async (c) => controller.getCampaignAnalytics(c));

export default advertiserRoutes;
