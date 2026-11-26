-- The existing stories and users tables are deliberately reused. These tables
-- only hold per-user interaction state that cannot be represented on stories.
CREATE TABLE "story_views" (
    "story_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_story_views" PRIMARY KEY ("story_id", "user_id"),
    CONSTRAINT "fk_story_views_story" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_story_views_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "story_reactions" (
    "id" BIGSERIAL NOT NULL,
    "story_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "reaction" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "story_reactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_story_reactions_story" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_story_reactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "uq_story_reactions_story_user_reaction" UNIQUE ("story_id", "user_id", "reaction")
);

CREATE TABLE "story_replies" (
    "id" BIGSERIAL NOT NULL,
    "story_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "story_replies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_story_replies_story" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_story_replies_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_stories_user_expires" ON "stories"("user_id", "expires_at");
CREATE INDEX "idx_stories_expires" ON "stories"("expires_at");
CREATE INDEX "idx_story_views_user_viewed" ON "story_views"("user_id", "viewed_at");
CREATE INDEX "idx_story_reactions_story_created" ON "story_reactions"("story_id", "created_at");
CREATE INDEX "idx_story_replies_story_created" ON "story_replies"("story_id", "created_at");
