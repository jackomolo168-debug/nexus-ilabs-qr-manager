# QR Code Management System

A full-stack QR code generation, scanning, and analytics platform with real-time tracking.

## Features

- ✅ JWT Authentication with role-based access (Admin/User)
- ✅ QR Code Generation (URL, Text, Contact, WiFi, JSON)
- ✅ QR Code Scanning via Camera or Image Upload
- ✅ Real-time scan tracking and analytics
- ✅ Redis caching for improved performance
- ✅ Rate limiting on scan endpoints
- ✅ PostgreSQL for data persistence
- ✅ WebSocket live updates
- ✅ Admin dashboard with system analytics
- ✅ CSV export of scan logs
- ✅ Dockerized for easy deployment

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL 15+ (for local development)
- Redis 7+ (for local development)

## Quick Start with Docker

1. Clone the repository:
```bash
git clone <repository-url>
cd qr-code-management