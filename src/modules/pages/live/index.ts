/**
 * Test Pages Router
 * المدخل الرئيسي لصفحات الاختبار
 */

import { Hono } from 'hono';
import {
    testMainPage as testLandingPage,
    testHostPage,
    testGuestPage,
    testViewerPage
} from './main';

const testRouter = new Hono();

// Routes
testRouter.get('/', testLandingPage);
testRouter.get('/host', testHostPage);
testRouter.get('/guest', testGuestPage);
testRouter.get('/viewer', testViewerPage);

export default testRouter;

