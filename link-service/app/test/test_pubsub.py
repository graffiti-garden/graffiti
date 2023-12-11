#!/usr/bin/env python3

import unittest
import aiohttp
from ..pubsub import msg_header_format, RequestHeader, ResponseHeader
import struct
from random import randbytes
from .utils import socket_connection, response_header_byte

class TestPubSub(unittest.IsolatedAsyncioTestCase):

    async def test_not_bytes(self):
        async with socket_connection() as ws:
            await ws.send_str('hello')
            reply = await ws.receive() 
            self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
            self.assertEqual(reply.data, response_header_byte('ERROR_WITHOUT_ID') + b'expecting bytes')

            await ws.send_json({})
            reply = await ws.receive() 
            self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
            self.assertEqual(reply.data, response_header_byte('ERROR_WITHOUT_ID') + b'expecting bytes')

    async def test_invalid_header(self):
        for num_bytes in [0, 5, struct.calcsize(msg_header_format) - 1]:
            async with socket_connection() as ws:
                await ws.send_bytes(randbytes(num_bytes))
                reply = await ws.receive() 
                self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
                self.assertEqual(reply.data, response_header_byte('ERROR_WITHOUT_ID') + b'not enough data')

                reply = await ws.receive()
                self.assertEqual(reply.type, aiohttp.WSMsgType.CLOSE)

    async def test_no_info_hash(self):
        async with socket_connection() as ws:
            for request in [RequestHeader.SUBSCRIBE, RequestHeader.UNSUBSCRIBE]:
                message_id = randbytes(16)
                await ws.send_bytes(struct.pack(
                    msg_header_format,
                    0,
                    request.value,
                    message_id
                ))

                reply = await ws.receive() 
                self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
                self.assertEqual(reply.data,
                    response_header_byte('ERROR_WITH_ID') +
                    message_id +
                    b'no info hash'
                )

    async def test_wrong_version(self):
        async with socket_connection() as ws:
            message_id = randbytes(16)
            await ws.send_bytes(struct.pack(
                msg_header_format,
                1,
                RequestHeader.UNSUBSCRIBE.value,
                message_id
                ))

            reply = await ws.receive() 
            self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
            self.assertEqual(reply.data,
                response_header_byte('ERROR_WITH_ID') +
                message_id +
                b'this is version zero'
            )

    async def test_non_existant_request(self):
        async with socket_connection() as ws:
            message_id = randbytes(16)
            await ws.send_bytes(struct.pack(
                msg_header_format,
                0,
                15,
                message_id
                ) + randbytes(32))

            reply = await ws.receive() 
            self.assertEqual(reply.type, aiohttp.WSMsgType.BINARY)
            self.assertEqual(reply.data,
                response_header_byte('ERROR_WITH_ID') +
                message_id +
                b'invalid request'
            )

    async def test_bad_info_hash(self):
        async with socket_connection() as ws:
            for byte_nums in [1, 5, 12, 24, 37, 1000]:
                info_hashes = randbytes(byte_nums)
                for request in [RequestHeader.SUBSCRIBE, RequestHeader.UNSUBSCRIBE]:
                    message_id = randbytes(16)
                    await ws.send_bytes(struct.pack(
                        msg_header_format,
                        0,
                        request.value,
                        message_id
                    ) + randbytes(byte_nums))

                    reply = await ws.receive()
                    self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
                    self.assertEqual(reply.data,
                        response_header_byte('ERROR_WITH_ID') +
                        message_id +
                        b'info hashes must each be exactly 32 bytes'
                    )

    async def test_good_info_hash(self):
        async with socket_connection() as ws:
            for byte_nums in [32, 64, 128, 32*32]:
                info_hashes = randbytes(byte_nums)
                for request in [RequestHeader.SUBSCRIBE, RequestHeader.UNSUBSCRIBE]:
                    message_id = randbytes(16)
                    await ws.send_bytes(struct.pack(
                        msg_header_format,
                        0,
                        request.value,
                        message_id
                    ) + info_hashes)

                    reply = await ws.receive()
                    self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
                    self.assertEqual(reply.data, response_header_byte('SUCCESS') + message_id)

                    if request == RequestHeader.SUBSCRIBE:
                        reply = await ws.receive()
                        self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
                        self.assertEqual(reply.data, response_header_byte('BACKLOG_COMPLETE') + info_hashes)

    async def test_double_subscribe(self):
        async with socket_connection() as ws:
            info_hashes = randbytes(64)

            message_id = randbytes(16)
            await ws.send_bytes(struct.pack(
                msg_header_format,
                0,
                RequestHeader.SUBSCRIBE.value,
                message_id
            ) + randbytes(32) + info_hashes + randbytes(128) ) # Sub with random overlap

            reply = await ws.receive()
            self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
            self.assertEqual(reply.data, response_header_byte('SUCCESS') + message_id)

            # Subscribe again
            message_id = randbytes(16)
            await ws.send_bytes(struct.pack(
                msg_header_format,
                0,
                RequestHeader.SUBSCRIBE.value,
                message_id
            ) + randbytes(64) + info_hashes + randbytes(64) )
            reply = await ws.receive()
            self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
            self.assertEqual(reply.data,
                response_header_byte('ERROR_WITH_ID') +
                message_id +
                b'already subscribed'
            )

    async def test_unsubscribe_without_subscribe(self):
        async with socket_connection() as ws:
            message_id = randbytes(16)
            await ws.send_bytes(struct.pack(
                msg_header_format,
                0,
                RequestHeader.UNSUBSCRIBE.value,
                message_id
            ) + randbytes(128))

            reply = await ws.receive()
            self.assertEqual(reply.type, aiohttp.WSMsgType.binary)
            self.assertEqual(reply.data,
                response_header_byte('ERROR_WITH_ID') +
                message_id +
                b'not subscribed'
            )

    async def test_close(self):
        async with socket_connection() as ws:
            await ws.close()
            reply = await ws.receive() 
            self.assertEqual(reply.type, aiohttp.WSMsgType.CLOSED)

if __name__ == "__main__":
    unittest.main()