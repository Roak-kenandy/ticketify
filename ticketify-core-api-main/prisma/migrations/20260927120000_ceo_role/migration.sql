INSERT INTO "roles" ("id", "name", "created_at", "updated_at", "deleted_at")
VALUES ('4', 'CEO', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;
