#!/usr/bin/env python3

import os
from our_data import OurData

# get a list of all the files
# find which files reference other files
# perform a topological sort
# if a cycle exists, error
# go from the leaves to the root

# Add a directory file

fn = "test.html"
with open(fn, "rb") as f:
    data = f.read()

od = OurData(data=data, media_type='text/ours')
od.pin()
print(od.get_addr())
