import m from 'mithril'
import api from '../entities/api'

export default {
  controller () {
    api.shows.fetch()
    this.user = api.user.get
    this.shows = api.shows.get
    this.editing = false
    this.isSaving = false

    this.currentShow = {
      id: m.prop(),
      name: m.prop(),
      description: m.prop(),
      url: m.prop(),
      twitter: m.prop()
    }

    this.create = () => {
      const s = {id: null}
      this.shows().unshift(s)
      this.edit(s)
    }
    this.edit = (s) => {
      if (!s) {
        if (this.shows()[0].id === null) this.shows().shift()
        this.editing = false
        return
      }
      this.editing = true
      this.currentShow.id(s.id)
      this.currentShow.name(s.name || '')
      this.currentShow.description(s.description || '')
      this.currentShow.url(s.url || '')
      this.currentShow.twitter(s.twitter || '')
    }
    this.save = () => {
      this.isSaving = true
      api.shows.fetch({
        id: this.currentShow.id(),
        name: this.currentShow.name(),
        description: this.currentShow.description(),
        url: this.currentShow.url(),
        twitter: this.currentShow.twitter()
      }, 'POST').then(() => {
        this.editing = false
        this.isSaving = false
      }).catch((err) => {
        console.error(err)
        this.isSaving = false
      })
    }
    this.remove = (s) => {
      if (!confirm('Are you sure you want to remove this show?\n' + s.name)) return
      this.isSaving = true
      api.shows.fetch(null, 'DELETE', '/' + s.id).then(() => {
        this.editing = false
        this.isSaving = false
      }).catch((err) => {
        console.error(err)
        this.isSaving = false
      })
    }
  },
  view (ctrl) {
    const isEditing = ctrl.editing
    return [
      ctrl.shows().map((s) => {
        delete s.authToken
        const editCurrent = isEditing && s.id === ctrl.currentShow.id()
        return m('.show', [
          !isEditing ? m('button.edit.right', {
            type: 'button',
            onclick: ctrl.edit.bind(ctrl, s)
          }, 'Edit') : null,
          m('.name', 'Name: ', !editCurrent ? s.name : m('input', {
            autocomplete: 'off',
            value: ctrl.currentShow.name(),
            oninput: m.withAttr('value', ctrl.currentShow.name),
            required: true
          })),
          m('.description', 'Description: ', !editCurrent ? s.description : m('input', {
            autocomplete: 'off',
            value: ctrl.currentShow.description(),
            oninput: m.withAttr('value', ctrl.currentShow.description)
          })),
          m('.url', 'Website: ', !editCurrent ? (s.url ? m('a', {
            href: s.url,
            target: '_blank'
          }, s.url) : '(none)') : m('input', {
            autocomplete: 'off',
            type: 'url',
            value: ctrl.currentShow.url(),
            oninput: m.withAttr('value', ctrl.currentShow.url)
          })),
          m('.twitter', 'Twitter: ', !editCurrent ? (s.twitter ? m('a', {
            href: 'https://twitter.com/' + s.twitter,
            target: '_blank'
          }, s.twitter) : '(none)') : m('input', {
            autocomplete: 'off',
            value: ctrl.currentShow.twitter(),
            oninput: m.withAttr('value', ctrl.currentShow.twitter)
          })),
          editCurrent ? [
            m('button.edit', {
              onclick: ctrl.edit.bind(ctrl, false),
              disabled: ctrl.isSaving
            }, 'Cancel'),
            ' ',
            m('button.edit', {
              onclick: ctrl.save.bind(ctrl),
              disabled: ctrl.isSaving
            }, 'Save'),
            s.id !== null && ctrl.user().canMakeShows ? [
              m('br'), m('br'),
              m('button.edit', {
                onclick: ctrl.remove.bind(ctrl, s),
                disabled: ctrl.isSaving
              }, 'Remove')
            ] : null
          ] : null
        ])
      }),
      ctrl.user().canMakeShows ? m('button', {onclick: ctrl.create.bind(this), disabled: isEditing}, 'Create') : null
    ]
  }
}