-- CreateTable
CREATE TABLE "GitHubOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOAuthState_stateHash_key" ON "GitHubOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubOAuthState_userId_idx" ON "GitHubOAuthState"("userId");

-- CreateIndex
CREATE INDEX "GitHubOAuthState_expiresAt_idx" ON "GitHubOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "GitHubOAuthState" ADD CONSTRAINT "GitHubOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
