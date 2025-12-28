/**
 * Test Stream Module - Router Only
 * هذا الملف للتوجيه فقط
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { testMainPage, testHostPage, testGuestPage, testViewerPage } from './main';

const testApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Routes
testApp.get('/', testMainPage);
testApp.get('/host', testHostPage);
testApp.get('/guest', testGuestPage);
testApp.get('/viewer', testViewerPage);

export default testApp;
