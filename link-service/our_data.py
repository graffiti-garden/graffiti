#!/usr/bin/env python3

import hashlib
import os

PIN_DIR = "pins"
HASH = hashlib.sha256()

class OurData:
    def __init__(self, data=None, addr=None):
        if data:
            self.set_data(data)
        if addr:
            self.set_addr(addr)

    @staticmethod
    def assert_data(data):
        if not isinstance(data, bytes):
            raise TypeError("Data must be bytes")
        
    @staticmethod
    def assert_addr(addr):
        if not isinstance(addr, bytes):
            raise TypeError("Address must be bytes")
        if len(addr) != HASH.digest_size:
            raise ValueError("Address must have length " + HASH.digest_size)

    def set_data(self, data):
        self.assert_data(data)
        self.data = data 
        self.addr = None

    def set_addr(self, addr):
        self.assert_addr(addr)
        self.addr = addr
        self.data = None

    def get_filename(self):
        return os.path.join(PIN_DIR, self.addr.hex())
        
    def get_addr(self):
        if self.addr:
            return self.addr
        if not self.data:
            raise Exception("No data to make address with")

        # Hash the object
        HASH.update(self.data)
        self.addr = HASH.digest()
        return self.addr

    def get_data(self):
        if self.data:
            return self.data
        if not self.addr:
            raise Exception("No address to get data with")

        # Lookup the address
        fn = self.get_filename() + ".data"
        if not os.path.isfile(fn):
            raise Exception("Address has not been pinned")

        # Read the file
        with open(fn, "rb") as f:
            self.data = f.read()
        return self.data

    def pin(self):
        fn = self.get_filename() + ".data"
        with open(fn, "wb") as f:
            f.write(self.get_data())

    def add_child(self, addr):
        self.assert_addr(addr)

        # Only add if it doesn't exist
        children = self.get_children()
        if addr in children:
            return

        fn = self.get_filename() + ".children"
        with open(fn, "ab") as f:
            f.write(addr)

    def get_children(self):
        fn = self.get_filename() + ".children"
        if not os.path.isfile(fn):
            return []

        with open(fn, "rb") as f:
            children = f.read()

        s = HASH.digest_size
        return [children[i*s:(i+1)*s] for i in range(int(len(children)/s))]

if __name__ == "__main__":
    od = OurData()

    # create an initial object
    data = "hello world".encode()
    od.set_data(data)
    addr = od.get_addr()
    od.pin()
    
    # create a comment object
    data2 = "oh hello to you".encode()
    od.set_data(data2)
    addr2 = od.get_addr()
    od.pin()

    # add the child to the original data
    od.set_addr(addr)
    assert(od.get_data() == data)
    od.add_child(addr2)
    assert(addr2 in od.get_children())
