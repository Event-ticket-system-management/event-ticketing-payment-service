# Payment Service - Architecture

## Overview

Payment Service is responsible for managing payment processing, payment transaction states, and asynchronous payment event communication within the Event Ticketing System.

## Responsibilities

* Asynchronous Payment Processing
* Payment Transaction Management
* Idempotency Handling
* Payment Status Management (`PENDING`, `COMPLETED`, `FAILED`)
* Payment Completion & Failure Event Publishing
* Kafka-based Event Communication

## Tech Stack

* Node.js / TypeScript
* NestJS Framework
* Prisma ORM / TypeORM
* PostgreSQL (`payment_db`)
* Apache Kafka

