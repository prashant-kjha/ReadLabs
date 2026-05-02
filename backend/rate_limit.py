"""
Shared rate limiter. Uses slowapi (in-memory by default) keyed on client IP.

For multi-process / multi-instance deployment, swap the storage backend to Redis
via SLOWAPI_STORAGE_URI. In-memory is fine for single-process local/dev.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
