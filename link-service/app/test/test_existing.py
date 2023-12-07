#!/usr/bin/env python3

import unittest
import asyncio
from time import time
from random import randbytes
from .utils import put_simple, socket_connection, subscribe_uris, response_header_byte
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

class TestExisting(unittest.IsolatedAsyncioTestCase):
    async def test_put_sub(self): 
        editor_pub, _, info_hash, _, container_signed = await put_simple()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            # Get the value itself
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed)

    async def test_put_multiple_same_sub(self):
        uri_private_key = Ed25519PrivateKey.generate()
        entries = []

        num_entries = 10
        for i in range(num_entries):
            editor_pub, _, info_hash, _, container_signed = \
                await put_simple(uri_private_key=uri_private_key)

            entries.append(response_header_byte('ANNOUNCE') + editor_pub + container_signed)
        
        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            msgs = set()
            for i in range(num_entries):
                msgs.add(await ws.receive_bytes())

            self.assertEqual(len(msgs), num_entries)
            for msg in msgs:
                self.assertIn(msg, entries)

    async def test_put_multiple_diff_sub(self):
        entries = {}
        num_entries = 10
        for i in range(num_entries):
            editor_pub, _, info_hash, _, container_signed = \
                await put_simple()
            entries[info_hash] = response_header_byte('ANNOUNCE') + editor_pub + container_signed

        self.assertEqual(len(entries), num_entries)

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, entries.keys())
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            msgs = set()
            for i in range(num_entries):
                msgs.add(await ws.receive_bytes())

            self.assertEqual(len(msgs), num_entries)
            for msg in msgs:
                self.assertIn(msg, entries.values())

    async def test_sub_seperately(self):
        entries = {}
        num_entries = 10
        for i in range(num_entries):
            editor_pub, _, info_hash, _, container_signed = \
                await put_simple()
            entries[info_hash] = response_header_byte('ANNOUNCE') + editor_pub + container_signed

        self.assertEqual(len(entries), num_entries)

        async with socket_connection() as ws:
            for info_hash in entries:
                message_id = await subscribe_uris(ws, [info_hash])
                msg = await ws.receive_bytes()
                self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)
                msg = await ws.receive_bytes()
                self.assertEqual(msg, entries[info_hash])

    async def test_sub_wrong_hash(self):
        _, _, info_hash, _, _ = \
            await put_simple()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [randbytes(32)])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 0.5)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

    async def test_replace(self):
        editor_pub, editor_priv, info_hash, uri_priv, container_signed = \
            await put_simple()
        
        # Then replace it
        _, _, _, _, container_signed2 = \
            await put_simple(counter=1, uri_private_key=uri_priv, editor_private_key=editor_priv)

        self.assertNotEqual(container_signed, container_signed2)

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('ANNOUNCE') + editor_pub + container_signed2)

    async def test_unsub(self):
        _, _, info_hash, _, _ = \
        await put_simple()

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash], unsubscribe=True)
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            # Get the value itself
            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 0.5)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

    async def test_expire(self):
        editor_pub, _, info_hash, _, container_signed = \
            await put_simple(int(time()+1))

        await asyncio.sleep(3)

        async with socket_connection() as ws:
            message_id = await subscribe_uris(ws, [info_hash])
            msg = await ws.receive_bytes()
            self.assertEqual(msg, response_header_byte('SUCCESS') + message_id)

            times_out = False
            try:
                await asyncio.wait_for(ws.receive_bytes(), 1)
            except TimeoutError:
                times_out = True
            self.assertTrue(times_out)

if __name__ == "__main__":
    unittest.main()