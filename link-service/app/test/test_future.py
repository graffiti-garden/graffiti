#!/usr/bin/env python3

import asyncio
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from time import time
from random import randbytes
from .utils import socket_connection, subscribe_uris, put_simple, response_header_byte

class TestFuture(unittest.IsolatedAsyncioTestCase):
    async def test_sub_put(self): 
        uri_private_key = Ed25519PrivateKey.generate()
        info_hash = uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            editor_pub, _, info_hash2, _, container_signed = \
                await put_simple(uri_private_key=uri_private_key)

            self.assertEqual(info_hash, info_hash2)

            # Get the value itself
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)
    
    async def test_sub_unsub_put(self):
        uri_private_key = Ed25519PrivateKey.generate()
        info_hash = uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            self.assertEqual(await ws.receive_bytes(), response_header_byte('SUCCESS') + message_id)

            message_id = await subscribe_uris(ws, [info_hash], unsubscribe=True)
            self.assertEqual(await ws.receive_bytes(), response_header_byte('SUCCESS') + message_id)

            _, _, info_hash2, _, _ = \
                await put_simple(uri_private_key=uri_private_key)
            self.assertEqual(info_hash, info_hash2)

            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 0.5)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

    async def test_sub_wrong_hash(self):
        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [randbytes(32)])
            self.assertEqual(await ws.receive_bytes(), response_header_byte('SUCCESS') + message_id)
            await put_simple()

            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 0.5)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

    async def test_replace(self):
        uri_private_key = Ed25519PrivateKey.generate()
        info_hash = uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            editor_pub, editor_priv, info_hash2, _, container_signed = \
                await put_simple(uri_private_key=uri_private_key)
            self.assertEqual(info_hash, info_hash2)

            # Get the value itself
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)

            # Replace it
            editor_pub2, _, info_hash3, _, container_signed2 = \
                await put_simple(counter=1, editor_private_key=editor_priv, uri_private_key=uri_private_key)
            self.assertEqual(editor_pub2, editor_pub)
            self.assertEqual(info_hash3, info_hash)
            self.assertNotEqual(container_signed2, container_signed)

            # Get the replaced value
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed2)

    async def test_replace_info_hash_twice(self):
        uri_private_key = Ed25519PrivateKey.generate()
        info_hash = uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            editor_pub, editor_priv, info_hash2, _, container_signed = \
                await put_simple(uri_private_key=uri_private_key)
            self.assertEqual(info_hash, info_hash2)

            # Get the value itself
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)

            # Replace it with a different info hash
            editor_pub2, _, info_hash3, _, container_signed2 = \
                await put_simple(counter=1, editor_private_key=editor_priv)
            self.assertEqual(editor_pub2, editor_pub)
            self.assertNotEqual(info_hash3, info_hash)
            self.assertNotEqual(container_signed2, container_signed)

            # Get the replaced value
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed2)

            # Replace it again 
            editor_pub3, _, info_hash4, _, _ = \
                await put_simple(counter=2, editor_private_key=editor_priv)
            self.assertEqual(editor_pub3, editor_pub)
            self.assertNotEqual(info_hash4, info_hash)

            # Time out because an update is only sent the first time
            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 0.5)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

    async def test_sub_multiple(self):
        uri_to_info_hash = {}
        for i in range(10):
            uri_private_key = Ed25519PrivateKey.generate()
            uri_to_info_hash[uri_private_key] = \
                uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            # Subscribe to all of them
            message_id = await subscribe_uris(ws, uri_to_info_hash.values())
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            # Post each of them
            for uri_private_key, info_hash in uri_to_info_hash.items():
                editor_pub, editor_priv, info_hash2, _, container_signed = \
                    await put_simple(uri_private_key=uri_private_key)
                self.assertEqual(info_hash, info_hash2)

                # Get the value
                msg = await ws.receive_bytes()
                self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)

    async def test_expire(self):
        uri_private_key = Ed25519PrivateKey.generate()
        info_hash = uri_private_key.public_key().public_bytes_raw()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            editor_pub, _, info_hash2, _, container_signed = \
                await put_simple(expiration=int(time()+2), uri_private_key=uri_private_key)

            self.assertEqual(info_hash, info_hash2)

            # Get the value itself
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)

            # And get it after it expires
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub)

if __name__ == "__main__":
    unittest.main()