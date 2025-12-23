# Guest API Documentation

This directory contains API endpoints for guest operations, including authentication and a key-value storage system.

## Authentication

Before accessing the KV store, you must authenticate as a guest.

### Login

*   **Endpoint:** `POST /api/guest/login`
*   **Headers:**
    *   `X-Guest-Passkey`: Your guest passkey (configured in the system).
*   **Response:**
    *   **Success (200):** Sets an HTTP-only cookie for authentication.
    *   **Error (401/400):** Invalid key or missing header.

**Example:**
```bash
curl -X POST http://localhost:4321/api/guest/login \
  -H "X-Guest-Passkey: your_secret_passkey" \
  -v
```

---

## Key-Value (KV) Storage

A simple JSON-based key-value store. Requires authentication.

### Get Value

*   **Endpoint:** `GET /api/guest/kv`
*   **Query Parameters:**
    *   `key`: The key to retrieve.
*   **Response:**
    *   Returns a JSON object containing the stored value and the last update timestamp.
    *   Structure: `{ "value": any, "updatedAt": number | null }`

**Example:**
```bash
# Ensure you have the auth cookie
curl "http://localhost:4321/api/guest/kv?key=MyConfig"
```

### Set Value

*   **Endpoint:** `PUT /api/guest/kv`
*   **Query Parameters:**
    *   `key`: The key to store.
*   **Headers:**
    *   `Content-Type`: `application/json`
*   **Body:** The JSON data you want to store.
*   **Response:**
    *   **Success (204):** No content.

**Example:**
```bash
curl -X PUT "http://localhost:4321/api/guest/kv?key=MyConfig" \
  -H "Content-Type: application/json" \
  -d '{"foo": "bar", "setting": 123}'
```
