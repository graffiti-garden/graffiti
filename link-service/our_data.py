#!/usr/bin/env python3

import hashlib
import os

PIN_DIR = "pins"
HASH = hashlib.sha256

class OurData:
    def __init__(self, addr=None, data=None, media_type=None):
        if data and media_type:
            self.set_data(data, media_type)
        if addr:
            self.set_addr(addr)

    @staticmethod
    def assert_media_type(media_type):
        split = media_type.split('/')
        if len(split) != 2:
            raise ValueError("Media type must have form TYPE/SUBTYPE")

    @staticmethod
    def assert_data(data):
        if not isinstance(data, bytes):
            raise TypeError("Data must be bytes")
        
    @staticmethod
    def assert_addr(addr):
        addr_b = bytes.fromhex(addr)
        if len(addr_b) != HASH().digest_size:
            raise ValueError("Address has length %i not %i." % (2*len(addr_b), 2*str(HASH().digest_size)))

    def set_data(self, data, media_type):
        self.assert_data(data)
        self.data = data 
        self.assert_media_type(media_type)
        self.media_type = media_type 
        self.addr = None

    def set_addr(self, addr):
        self.assert_addr(addr)
        self.addr = addr
        self.data = None
        self.media_type = None
        
    def get_addr(self):
        if self.addr:
            return self.addr
        if not self.data:
            raise Exception("No data to make address")

        # Hash the object
        h = HASH()
        h.update(self.data)
        self.addr = h.hexdigest()
        return self.addr

    def get_filename(self, ext):
        return os.path.join(PIN_DIR, self.get_addr()) + '.' + ext

    def read_from_ext(self, ext):
        if not self.addr:
            raise Exception("No address to fetch data")

        # Lookup the address
        fn = self.get_filename(ext)
        if not os.path.isfile(fn):
            raise KeyError("Address has not been pinned")

        # Read the file
        with open(fn, "rb") as f:
            contents = f.read()
        return contents

    def get_data(self):
        if self.data:
            return self.data
        return self.read_from_ext('data')

    def get_media_type(self):
        if self.media_type:
            return self.media_type
        return self.read_from_ext('type').decode()

    def write_to_ext(self, contents, ext):
        fn = self.get_filename(ext)
        with open(fn, "wb") as f:
            f.write(contents)

    def pin(self):
        self.write_to_ext(self.get_data(), 'data')
        self.write_to_ext(self.get_media_type().encode(), 'type')

    def add_child(self, addr):
        self.assert_addr(addr)

        # Only add if it doesn't exist
        children = self.get_children()
        if addr in children:
            return

        fn = self.get_filename('children')
        with open(fn, "a") as f:
            f.write(addr)

    def get_children(self):
        fn = self.get_filename('children')
        if not os.path.isfile(fn):
            return []

        with open(fn, "r") as f:
            children = f.read()

        s = 2*HASH().digest_size
        return [children[i*s:(i+1)*s] for i in range(int(len(children)/s))]

if __name__ == "__main__":
    od = OurData()

    # create an initial object
    data = "hello world".encode()
    od.set_data(data, 'text/ours')
    addr = od.get_addr()
    od.pin()
    
    # create a comment object
    data2 = "oh hello to you".encode()
    od.set_data(data2, 'text/ours')
    addr2 = od.get_addr()
    od.pin()

    # add the child to the original data
    od.set_addr(addr)
    assert(od.get_data() == data)
    od.add_child(addr2)
    assert(addr2 in od.get_children())
