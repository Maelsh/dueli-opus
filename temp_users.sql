INSERT INTO users (username, email, password_hash, display_name, bio, language, is_verified, is_active, email_verified, created_at, updated_at)
VALUES ('testhost', 'testhost@dueli.test', '9a931c55ac02bf216550c464b1992a30c522dfabf6cb31deada5c716bc13a263', 'Test Host', 'Test account for host', 'ar', 1, 1, 1, datetime('now'), datetime('now'));

INSERT INTO users (username, email, password_hash, display_name, bio, language, is_verified, is_active, email_verified, created_at, updated_at)
VALUES ('testguest', 'testguest@dueli.test', '9a931c55ac02bf216550c464b1992a30c522dfabf6cb31deada5c716bc13a263', 'Test Guest', 'Test account for guest', 'ar', 1, 1, 1, datetime('now'), datetime('now'));
