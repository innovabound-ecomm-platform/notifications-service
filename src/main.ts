import app from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./config/logger.js";
import { producer, consumer } from "./kafka/index.js";
import { allHandlers } from "./kafka/handlers.js";

async function main() {
  // Connect to Kafka
  try {
    await producer.connect();
    logger.info("Kafka producer connected");

    await consumer.connect();
    await consumer.subscribe(allHandlers);
    logger.info("Kafka consumer connected and subscribed", {
      topics: allHandlers.map((h) => h.topicName),
    });
  } catch (error) {
    logger.error("Failed to connect to Kafka", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Continue without Kafka - service can still handle HTTP requests
  }

  const server = app.listen(config.port, () => {
    logger.info(`Notifications service running on port ${config.port}`);
    logger.info(`📚 API Documentation:`);
    logger.info(`   - Swagger UI: http://localhost:${config.port}/api-docs`);
    logger.info(`   - OpenAPI JSON: http://localhost:${config.port}/api-docs.json`);
    logger.info(`   - ReDoc: http://localhost:${config.port}/redoc`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close Kafka connections
    try {
      await consumer.disconnect();
      await producer.disconnect();
      logger.info("Kafka connections closed");
    } catch (error) {
      logger.error("Error during Kafka cleanup", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error("Failed to start notifications service", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
