Entity = require('../entities/entity')
View = require('../admin/views')

class Playlist extends Marionette.Module
	startWithParent: false

	onStart: ->
		@controller = new Playlist.Controller


class Playlist.Router extends Marionette.AppRouter
	appRoutes:
		'playlist/*name': 'showPlaylist'

class Playlist.Controller extends Base.Controller
	initialize: (options) ->

		new Playlist.Router
			controller: @

		@currentPlaylist = null



		@layout = @getLayout()

		@tracks = new Entity.Playlist

		@listView = @getListView @tracks

		#console.log @listView, @tracks

		App.commands.setHandler 'playlist:change', (name, fromUser, instant) =>
			if instant then App.commands.execute 'navigate', 'playlist'
			#console.log 'path:change', path, fromUser, instant
			@currentPlaylist = name
			@tracks.playlist = name
			@tracks.fetch
				reset: true
				success: ->
					#if fromUser and !instant
						#App.commands.execute 'navigate', 'playlist'

		@listenTo @, 'navigate', =>
			name = @currentName
			console.log 'navigate', name
			#App.navigate 'playlist/'+encodeURI(name)

		@layout.listRegion.show @listView


	getLayout: ->
		new Playlist.Layout

	getListView: (collection) ->
		new View.Tracks
			collection: collection

	showPlaylist: (name) ->
		App.commands.execute 'playlist:change', name, true
		console.log 'show playlist', name

class Playlist.Layout extends Marionette.LayoutView
	el: '#playlistLayout'
	template: false

	regions:
		listRegion: '#playlistList'

module.exports = Playlist
