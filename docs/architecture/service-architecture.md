# Event Ticketing - Payment Service

[![CI Pipeline](https://github.com/Event-ticket-system-management/event-ticketing-payment-service/actions/workflows/ci.yml/badge.svg)](https://github.com/Event-ticket-system-management/event-ticketing-payment-service/actions)

## 📌 Overview

`event-ticketing-payment-service` is the core microservice responsible for managing payment processing, payment status tracking, and asynchronous payment event execution within the Event Ticketing System.

## 🏗️ Service Responsibilities

* Processing booking payment requests asynchronously via Kafka events.
* Handling idempotency to prevent duplicate payment processing.
* Managing payment transaction states (`PENDING`, `COMPLETED`, `FAILED`).
* Publishing payment completion and failure events to Kafka.

## 🛠️ Tech Stack

* **Language:** Node.js / TypeScript
* **Framework:** NestJS
* **ORM:** Prisma ORM / TypeORM
* **Database:** PostgreSQL (`payment_db`)
* **Messaging:** Apache Kafka
* **Containerization:** Docker

## 📐 Architecture

```mermaid
graph TD
    Booking[Booking Service] -->|Payment Event| Kafka[Apache Kafka]
    Kafka --> Payment[Payment Service]
    Payment --> Idempotency[Idempotency Check]
    Payment --> Processor[Payment Processor]
    Processor --> DB[(PostgreSQL payment_db)]
    Payment -->|Payment Completed / Failed| Kafka
    Kafka --> Booking
```

