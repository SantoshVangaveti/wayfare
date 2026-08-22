-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "legId" TEXT;

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "country" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 0,
    "coverImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Leg_tripId_order_idx" ON "Leg"("tripId", "order");

-- CreateIndex
CREATE INDEX "Block_legId_idx" ON "Block"("legId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

