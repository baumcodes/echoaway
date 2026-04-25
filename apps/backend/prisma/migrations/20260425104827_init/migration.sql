-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentDestinationId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "coordinates" TEXT,
    "summary" TEXT,
    "tags" TEXT,
    CONSTRAINT "Destination_parentDestinationId_fkey" FOREIGN KEY ("parentDestinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iataCode" TEXT NOT NULL,
    "icaoCode" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "servesDestinationId" TEXT,
    "coordinates" TEXT,
    CONSTRAINT "Airport_servesDestinationId_fkey" FOREIGN KEY ("servesDestinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contractRefPattern" TEXT
);

-- CreateTable
CREATE TABLE "AccommodationProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinationId" TEXT,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "pricePerNightCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amenities" TEXT,
    "coordinates" TEXT,
    "description" TEXT,
    "defaultCancellationTerms" TEXT,
    "defaultModificationPolicy" TEXT,
    "images" TEXT,
    "contractRef" TEXT,
    CONSTRAINT "AccommodationProduct_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccommodationProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinationId" TEXT,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT,
    "durationHours" REAL NOT NULL,
    "openingHours" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "contractRef" TEXT,
    CONSTRAINT "ActivityProduct_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlightRouteProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromAirportId" TEXT NOT NULL,
    "toAirportId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "stops" INTEGER NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "priceAvgCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "fareConditions" TEXT NOT NULL,
    "durationHours" REAL NOT NULL,
    CONSTRAINT "FlightRouteProduct_fromAirportId_fkey" FOREIGN KEY ("fromAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlightRouteProduct_toAirportId_fkey" FOREIGN KEY ("toAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlightRouteProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlightRouteLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightRouteProductId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "fromAirportId" TEXT NOT NULL,
    "toAirportId" TEXT NOT NULL,
    "flightNo" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "depTime" TEXT NOT NULL,
    "arrTime" TEXT NOT NULL,
    CONSTRAINT "FlightRouteLeg_flightRouteProductId_fkey" FOREIGN KEY ("flightRouteProductId") REFERENCES "FlightRouteProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlightRouteLeg_fromAirportId_fkey" FOREIGN KEY ("fromAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlightRouteLeg_toAirportId_fkey" FOREIGN KEY ("toAirportId") REFERENCES "Airport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroundTransferProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromAirportId" TEXT,
    "toDestinationId" TEXT,
    "toAccommodationProductId" TEXT,
    "supplierId" TEXT NOT NULL,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "schedule" TEXT,
    "description" TEXT,
    "contractRef" TEXT,
    CONSTRAINT "GroundTransferProduct_fromAirportId_fkey" FOREIGN KEY ("fromAirportId") REFERENCES "Airport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroundTransferProduct_toDestinationId_fkey" FOREIGN KEY ("toDestinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroundTransferProduct_toAccommodationProductId_fkey" FOREIGN KEY ("toAccommodationProductId") REFERENCES "AccommodationProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroundTransferProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "locale" TEXT
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TripTraveler" (
    "tripId" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    PRIMARY KEY ("tripId", "travelerId"),
    CONSTRAINT "TripTraveler_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripTraveler_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "TripSegment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripSegment_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "segmentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "accommodationProductId" TEXT,
    "activityProductId" TEXT,
    "flightRouteProductId" TEXT,
    "groundTransferProductId" TEXT,
    CONSTRAINT "Component_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Component_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TripSegment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Component_accommodationProductId_fkey" FOREIGN KEY ("accommodationProductId") REFERENCES "AccommodationProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Component_activityProductId_fkey" FOREIGN KEY ("activityProductId") REFERENCES "ActivityProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Component_flightRouteProductId_fkey" FOREIGN KEY ("flightRouteProductId") REFERENCES "FlightRouteProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Component_groundTransferProductId_fkey" FOREIGN KEY ("groundTransferProductId") REFERENCES "GroundTransferProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponentBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierBookingReference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "policy" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "bookedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    CONSTRAINT "ComponentBooking_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComponentBooking_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "destinationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "timezone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    CONSTRAINT "ComponentEvent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComponentEvent_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Disruption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "affectedComponentId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestedActions" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Disruption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Disruption_affectedComponentId_fkey" FOREIGN KEY ("affectedComponentId") REFERENCES "Component" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "travelerId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "audioMetric" TEXT,
    "status" TEXT NOT NULL,
    CONSTRAINT "VoiceSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceSession_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceActionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "tripId" TEXT,
    "componentId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceActionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceActionEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VoiceActionEvent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "sessionId" TEXT,
    "transcript" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Destination_parentDestinationId_idx" ON "Destination"("parentDestinationId");

-- CreateIndex
CREATE INDEX "Destination_countryCode_idx" ON "Destination"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_iataCode_key" ON "Airport"("iataCode");

-- CreateIndex
CREATE INDEX "Airport_servesDestinationId_idx" ON "Airport"("servesDestinationId");

-- CreateIndex
CREATE INDEX "Airport_city_idx" ON "Airport"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "AccommodationProduct_destinationId_idx" ON "AccommodationProduct"("destinationId");

-- CreateIndex
CREATE INDEX "AccommodationProduct_supplierId_idx" ON "AccommodationProduct"("supplierId");

-- CreateIndex
CREATE INDEX "ActivityProduct_destinationId_idx" ON "ActivityProduct"("destinationId");

-- CreateIndex
CREATE INDEX "ActivityProduct_supplierId_idx" ON "ActivityProduct"("supplierId");

-- CreateIndex
CREATE INDEX "FlightRouteProduct_fromAirportId_idx" ON "FlightRouteProduct"("fromAirportId");

-- CreateIndex
CREATE INDEX "FlightRouteProduct_toAirportId_idx" ON "FlightRouteProduct"("toAirportId");

-- CreateIndex
CREATE INDEX "FlightRouteProduct_supplierId_idx" ON "FlightRouteProduct"("supplierId");

-- CreateIndex
CREATE INDEX "FlightRouteLeg_flightRouteProductId_idx" ON "FlightRouteLeg"("flightRouteProductId");

-- CreateIndex
CREATE INDEX "FlightRouteLeg_fromAirportId_idx" ON "FlightRouteLeg"("fromAirportId");

-- CreateIndex
CREATE INDEX "FlightRouteLeg_toAirportId_idx" ON "FlightRouteLeg"("toAirportId");

-- CreateIndex
CREATE INDEX "GroundTransferProduct_fromAirportId_idx" ON "GroundTransferProduct"("fromAirportId");

-- CreateIndex
CREATE INDEX "GroundTransferProduct_toDestinationId_idx" ON "GroundTransferProduct"("toDestinationId");

-- CreateIndex
CREATE INDEX "GroundTransferProduct_toAccommodationProductId_idx" ON "GroundTransferProduct"("toAccommodationProductId");

-- CreateIndex
CREATE INDEX "GroundTransferProduct_supplierId_idx" ON "GroundTransferProduct"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Traveler_phone_key" ON "Traveler"("phone");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_startDate_idx" ON "Trip"("startDate");

-- CreateIndex
CREATE INDEX "TripTraveler_travelerId_idx" ON "TripTraveler"("travelerId");

-- CreateIndex
CREATE INDEX "TripSegment_tripId_idx" ON "TripSegment"("tripId");

-- CreateIndex
CREATE INDEX "TripSegment_destinationId_idx" ON "TripSegment"("destinationId");

-- CreateIndex
CREATE INDEX "Component_tripId_idx" ON "Component"("tripId");

-- CreateIndex
CREATE INDEX "Component_segmentId_idx" ON "Component"("segmentId");

-- CreateIndex
CREATE INDEX "Component_type_idx" ON "Component"("type");

-- CreateIndex
CREATE INDEX "Component_accommodationProductId_idx" ON "Component"("accommodationProductId");

-- CreateIndex
CREATE INDEX "Component_activityProductId_idx" ON "Component"("activityProductId");

-- CreateIndex
CREATE INDEX "Component_flightRouteProductId_idx" ON "Component"("flightRouteProductId");

-- CreateIndex
CREATE INDEX "Component_groundTransferProductId_idx" ON "Component"("groundTransferProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentBooking_componentId_key" ON "ComponentBooking"("componentId");

-- CreateIndex
CREATE INDEX "ComponentBooking_supplierId_idx" ON "ComponentBooking"("supplierId");

-- CreateIndex
CREATE INDEX "ComponentBooking_status_idx" ON "ComponentBooking"("status");

-- CreateIndex
CREATE INDEX "ComponentEvent_componentId_idx" ON "ComponentEvent"("componentId");

-- CreateIndex
CREATE INDEX "ComponentEvent_destinationId_idx" ON "ComponentEvent"("destinationId");

-- CreateIndex
CREATE INDEX "ComponentEvent_type_idx" ON "ComponentEvent"("type");

-- CreateIndex
CREATE INDEX "ComponentEvent_startsAt_idx" ON "ComponentEvent"("startsAt");

-- CreateIndex
CREATE INDEX "Disruption_tripId_idx" ON "Disruption"("tripId");

-- CreateIndex
CREATE INDEX "Disruption_affectedComponentId_idx" ON "Disruption"("affectedComponentId");

-- CreateIndex
CREATE INDEX "Disruption_status_idx" ON "Disruption"("status");

-- CreateIndex
CREATE INDEX "VoiceSession_tripId_idx" ON "VoiceSession"("tripId");

-- CreateIndex
CREATE INDEX "VoiceSession_travelerId_idx" ON "VoiceSession"("travelerId");

-- CreateIndex
CREATE INDEX "VoiceSession_status_idx" ON "VoiceSession"("status");

-- CreateIndex
CREATE INDEX "VoiceActionEvent_sessionId_idx" ON "VoiceActionEvent"("sessionId");

-- CreateIndex
CREATE INDEX "VoiceActionEvent_tripId_idx" ON "VoiceActionEvent"("tripId");

-- CreateIndex
CREATE INDEX "VoiceActionEvent_componentId_idx" ON "VoiceActionEvent"("componentId");

-- CreateIndex
CREATE INDEX "VoiceActionEvent_type_idx" ON "VoiceActionEvent"("type");

-- CreateIndex
CREATE INDEX "VoiceActionEvent_createdAt_idx" ON "VoiceActionEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportLog_sessionId_key" ON "SupportLog"("sessionId");

-- CreateIndex
CREATE INDEX "SupportLog_tripId_idx" ON "SupportLog"("tripId");
