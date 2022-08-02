export default function({myID, toggleLogIn}) { return {
  setup: ()=> ({myID, toggleLogIn}),

  template: `
    <button @click="toggleLogIn">
      {{ myID? 'Log Out' : 'Log In' }}
    </button>`
}}
