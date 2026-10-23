-- CreateTable
CREATE TABLE "DigestOptOut" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestOptOut_pkey" PRIMARY KEY ("email")
);

