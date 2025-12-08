/**
 * @file modules/users/routes.ts
 * @description مسارات المستخدمين
 * @description_en User routes
 * @module modules/users
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import { userController } from './UserController';
import type { Bindings, Variables } from '../../core/http/types';

/**
 * مسارات المستخدمين
 * User routes
 */
const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// الملف الشخصي
userRoutes.get('/me', (c) => userController.getMe(c));
userRoutes.put('/me', (c) => userController.updateProfile(c));
userRoutes.put('/preferences', (c) => userController.updatePreferences(c));

// البحث والقوائم
userRoutes.get('/search', (c) => userController.searchUsers(c));
userRoutes.get('/top', (c) => userController.getTopUsers(c));

// ملفات المستخدمين
userRoutes.get('/username/:username', (c) => userController.getProfileByUsername(c));
userRoutes.get('/:id', (c) => userController.getProfile(c));

// المتابعة
userRoutes.post('/:id/follow', (c) => userController.follow(c));
userRoutes.post('/:id/unfollow', (c) => userController.unfollow(c));
userRoutes.get('/:id/followers', (c) => userController.getFollowers(c));
userRoutes.get('/:id/following', (c) => userController.getFollowing(c));

/**
 * مسارات الإشعارات
 * Notification routes
 */
const notificationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notificationRoutes.get('/', (c) => userController.getNotifications(c));
notificationRoutes.post('/read-all', (c) => userController.markAllAsRead(c));
notificationRoutes.post('/:id/read', (c) => userController.markAsRead(c));
notificationRoutes.delete('/:id', (c) => userController.deleteNotification(c));

export { userRoutes, notificationRoutes };
export default userRoutes;
