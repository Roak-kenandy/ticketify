INSERT INTO "roles" ("id", "name", "created_at", "updated_at", "deleted_at")
VALUES ('5', 'Finance', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;
