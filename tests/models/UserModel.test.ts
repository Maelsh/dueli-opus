import { describe, it, expect, beforeEach } from 'vitest';
import { UserModel } from '../../src/models/UserModel';
import { UserBlockModel } from '../../src/models/UserBlockModel';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';
import { FakeD1 } from '../helpers/fake-d1';

describe('UserModel', () => {
    let db: FakeD1;
    let users: UserModel;

    beforeEach(() => {
        db = new FakeD1();
        users = new UserModel(db as unknown as D1Database);
    });

    it('creates a user and finds it by username/email', async () => {
        const created = await users.create({
            email: 'a@test.com',
            username: 'alice',
            display_name: 'Alice',
            password_hash: await CryptoUtils.hashPassword('password123'),
            country: 'SA',
            language: 'ar'
        });

        expect(created.id).toBeGreaterThan(0);
        expect(created.username).toBe('alice');

        const byUsername = await users.findByUsername('alice');
        expect(byUsername?.email).toBe('a@test.com');

        const byEmail = await users.findByEmail('a@test.com');
        expect(byEmail?.username).toBe('alice');

        expect(await users.emailExists('a@test.com')).toBe(true);
        expect(await users.usernameExists('alice')).toBe(true);
        expect(await users.emailExists('missing@test.com')).toBe(false);
    });

    it('username lookup is case-insensitive', async () => {
        await users.create({
            email: 'b@test.com',
            username: 'bob',
            display_name: 'Bob'
        });
        expect(await users.findByUsername('BOB')).not.toBeNull();
    });

    it('returns null for unknown users', async () => {
        expect(await users.findByUsername('ghost')).toBeNull();
        expect(await users.findByEmail('ghost@test.com')).toBeNull();
    });
});

describe('UserBlockModel (ban/block)', () => {
    let db: FakeD1;
    let users: UserModel;
    let blocks: UserBlockModel;

    beforeEach(() => {
        db = new FakeD1();
        users = new UserModel(db as unknown as D1Database);
        blocks = new UserBlockModel(db as unknown as D1Database);
    });

    async function makeUser(username: string) {
        return users.create({
            email: `${username}@test.com`,
            username,
            display_name: username
        });
    }

    it('blocks and unblocks a user', async () => {
        const a = await makeUser('blocker');
        const b = await makeUser('blocked');

        expect(await blocks.isBlocked(a.id, b.id)).toBe(false);
        await blocks.block(a.id, b.id, 'spam');
        expect(await blocks.isBlocked(a.id, b.id)).toBe(true);
        // symmetric check
        expect(await blocks.isBlocked(b.id, a.id)).toBe(true);

        const list = await blocks.getBlockedUsers(a.id);
        expect(list.length).toBe(1);

        await blocks.unblock(a.id, b.id);
        expect(await blocks.isBlocked(a.id, b.id)).toBe(false);
    });

    it('cannot block yourself or twice', async () => {
        const a = await makeUser('lonely');
        await expect(blocks.block(a.id, a.id)).rejects.toThrow();
        const b = await makeUser('other');
        await blocks.block(a.id, b.id);
        await expect(blocks.block(a.id, b.id)).rejects.toThrow();
    });
});
