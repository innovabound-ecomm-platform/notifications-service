/**
 * Kafka Client Setup for Notifications Service
 * 
 * Consumes events from various services to create in-app notifications.
 */

import { createKafkaClient, createConsumer, createProducer } from "@innovabound-ecomm-platform/kafka-client";
import { config } from "../config/index.js";

const kafkaClient = createKafkaClient(config.kafka.clientId);

export const producer = createProducer(kafkaClient);
export const consumer = createConsumer(kafkaClient, `${config.kafka.clientId}-group`);
