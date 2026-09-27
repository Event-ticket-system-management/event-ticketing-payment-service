# Payment Service - Architecture

## Overview

Payment Service is responsible for managing payment processing, payment transaction states, and asynchronous payment event communication within the Event Ticketing System.

The service is built using NestJS and provides the foundation for handling payment-related operations and Kafka-based asynchronous communication between microservices.

## Responsibilities

- Asynchronous Payment Processing
- Payment Transaction Management
- Idempotency Handling
- Payment Status Management
  - `PENDING`
  - `COMPLETED`
  - `FAILED`
- Payment Completion Event Publishing
- Payment Failure Event Publishing
- Kafka-based Event Communication

## Tech Stack

| Technology | Version / Details |
|---|---|
| Node.js | Node.js runtime |
| TypeScript | 5.7.3 |
| NestJS | 11.x |
| NestJS Microservices | 11.2.6 |
| TypeORM | 1.1.1 |
| PostgreSQL | PostgreSQL database |
| PostgreSQL Driver | `pg` 8.23.0 |
| Apache Kafka | KafkaJS 2.2.4 |
| RxJS | 7.8.1 |
| Jest | 30.0.0 |
| ESLint | 9.18.0 |
| Prettier | 3.4.2 |

## Dependencies

The Payment Service uses the following main dependencies:

- `@nestjs/common`
- `@nestjs/core`
- `@nestjs/config`
- `@nestjs/microservices`
- `@nestjs/platform-express`
- `@nestjs/typeorm`
- `typeorm`
- `pg`
- `kafkajs`
- `reflect-metadata`
- `rxjs`

## Architecture

```mermaid
flowchart LR

    Client[Client / Frontend]

    Gateway[API Gateway]

    PaymentService[Payment Service]

    PostgreSQL[(PostgreSQL<br/>payment_db)]

    Kafka[Apache Kafka]

    BookingService[Booking Service]

    Client --> Gateway
    Gateway --> PaymentService

    PaymentService --> PostgreSQL
    PaymentService --> Kafka

    Kafka --> BookingService
