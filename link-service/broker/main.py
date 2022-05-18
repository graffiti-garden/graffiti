import asyncio
from aio_pika import Message, connect
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    # Connect to Mongo
    client = AsyncIOMotorClient('mongo')
    db = client.graffiti.objects

    # Connect to Rabbit
    connection = await aio_pika.connect_robust('rabbit')

    async with connection:
        # Construct the object
        add_queue = await channel.declare_queue('add_id')
        delete_queue = await channel.declare_queue('delete_id')
        await channel.declare_queue('change_socket')

        await queue.consume(process_message)

        async with message.process():
            print(message.body)

    # Start 
    while True:
        async for changes in qb.process_batch():
            await gs.push_changes(changes)


async def main() -> None:
    # Perform connection
    connection = await connect("amqp://guest:guest@localhost/")

    async with connection:
        # Creating a channel
        channel = await connection.channel()

        # Declaring queue
        queue = await channel.declare_queue("hello")

        # Sending the message
        await channel.default_exchange.publish(
            Message(b"Hello World!"),
            routing_key=queue.name,
        )

        print(" [x] Sent 'Hello World!'")


if __name__ == "__main__":
    asyncio.run(main())
