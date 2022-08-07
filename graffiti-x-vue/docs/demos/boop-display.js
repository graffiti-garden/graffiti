export default {
  props: ['title', 'boops', 'remove'],

  template: `
    <p>
      {{ title }}:
      <span v-for="boop in boops">
        <a @click="remove(boop)">
          boop
        </a>
      </span>
    </p>`
}
