window.onload = function() {
  // Create a sidebar that allows you to login
  
  // Once you login it stores a cookie so other
  // sites use the same login.
  
  // Once logged in, The sidebar also contains costumes.
  // You can select which one to use
  // A costume is an activty pub "actor" which contains
  // a name, blurb, profile photo, website link, etc.
  // also a public/private key
  // you can also choose anonymous

  // to find the costumes you go to:
  // loginkey/costumes
  // there will be a Point action there that points to
  // the URL where they are actually stored
  // there might also be
  // loginkey/contacts
  // loginkey/bestfriends
  // ...
  
  // The library also exposes these functions
  // for the page to use:

  // Pod functions
  // url = self.put.note(message)
  //       self.delete(url)
  //       get(url)

  // Perform functions:
  // self.perform.create(location, url)
  // self.perform.delete(location, url)
  // self.perform.update(location, url)

  // Attend functions:
  // attend = me.attend(callback=mycallback)
  // attend.add(stage)
  // attend.remove(stage)

  // mycallback():
  //  if type=create:
  //    if the item is mine:
  //      do x
  //  if type=delete:
  //    undo x
  //  if type=update:
  //    refresh x
  //    make an alert
  //  else:
  //    do something with the default text
};
