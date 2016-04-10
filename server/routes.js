
import express from 'express'
import path from 'path'
import fs from 'fs'
import mm from 'musicmetadata'
import { fetchJSON } from '../scripts/fetcher'
import Song from './models/song'
import User from './models/user'
import simpleconfig from '../scripts/simpleconfig'
import sse from './sse'


let htmloptions = {
	root: __dirname + '/../build/document/',
	dotfiles: 'deny',
	maxAge: 365*24*60*60*1000
}

function cleanpath(p) {
	return path.join('/', p).substr(1)
}

function isAdmin(req, res, next) {

	if ((req.isAuthenticated() && req.user.level >= 5) || (req.query && req.query.apikey === 'F5DCB721287C43C8987942B5F10C417E')) {
		next()
	} else {
		res.writeHead(401)
		res.end('401 Unauthorized')
	}
}

function isInternal(req, res, next) {
	if (req.ip === '127.0.0.1' || req.ip === '::1') {
		next()
	} else {
		res.writeHead(403)
		res.end('403 Permission denied. Only internal!')
	}
}

function cors(res) {
	res.set({
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
	})
	return res
}

function nocache(res) {
	// http://stackoverflow.com/a/2068407
	res.set({
		'Cache-Control': 'no-cache, no-store, must-revalidate', // HTTP 1.1.
		'Pragma': 'no-cache', // HTTP 1.0.
		'Expires': '0' // Proxies.
	})
	return res
}




export default function(app, passport, config, mpd, liquid, icecast, scheduler, livestream) {
	//inDev = app.get('env') == 'development'

	const EqBeats = require('./models/eqbeats')(config)

	const internalRouter = express.Router()
	const defaultRouter = express.Router()
	const apiRouter = express.Router()
	const adminRouter = express.Router()


	internalRouter.post('/meta', (req, res) => {
		let m = req.body
		if (Object.keys(m).length === 0) {
			res.send('(none)')
		}
		else {
			liquid.setMeta(m)
			res.send(JSON.stringify(m, null, 1))
		}
	})

	internalRouter.post('/authlive', (req, res) => {
		console.log(req.body)
		let username = req.body.username || ''
		let password = req.body.password || ''
		let out = {}
		function send() {
			res.send(JSON.stringify(out, null, 1))
		}

		if (username.toLowerCase() === 'source' && password !== '') {
			User.authUserWithShow(password, function (err, show, user, userAuth) {
				if (err) {
					console.error(err)
					out.error = 'Invalid token: '+err
					send()
					return
				}

				let userTwitter = ''
				for (a of userAuth) {
					if (a.provider === 'twitter') {
						userTwitter = a.username
					}
				}
				out.live_unique = user.id+'_'+show.id
				out.live_userId = user.id+''
				out.live_showId = show.id+''
				out.live_username = user.username || ''
				out.live_displayname = user.displayName || ''
				out.live_twitter = show.twitter || userTwitter || ''
				out.live_name = show.name || ''
				out.live_description = show.description || ''
				out.url = show.url || user.url || ''
				out.art = show.art || user.avatarUrl || ''
				send()
			})

		} else {
			out.error = 'Wrong username or password'
			send()
		}
	})

	// internalRouter.get '/liq/yt', (req, res) ->
	// 	url = req.query.url
	// 	console.log 'Remuxing youtube video '+url
	// 	ytdl = child_process.spawn 'youtube-dl', ['--restrict-filenames', '-f', 'bestaudio', '-g', url]
	// 	d = ""
	// 	ytdl.stdout.on 'data', (data) ->
	// 		d += data.toString 'utf8'
	// 	ytdl.once 'close', ->
	// 		https.get d.trim(), (aacdata) ->
	// 			tmpfile = temp.createWriteStream()
	// 			console.log 'Running ffmpeg...'
	// 			ffmpeg = child_process.spawn 'ffmpeg', ['-y', '-loglevel', 'warning', '-i', '-', '-acodec', 'copy', '-f', 'mp4', tmpfile.path], stdio: 'pipe'
	// 			ffmpeg.stderr.pipe process.stderr
	// 			ffmpeg.stdout.pipe process.stdout
	// 			aacdata.pipe ffmpeg.stdin


	// 			ffmpeg.once 'close', ->
	// 				console.log 'Remuxing complete! Sending...'
	// 				res.setHeader "Content-Type", "audio/mp4"
	// 				s = fs.createReadStream tmpfile.path
	// 				s.pipe res

	// 				s.once 'close', ->
	// 					fs.unlink tmpfile.path, ->
	// 						console.log 'Sent and removed temporary file!'
	// 	###child_process.exec "wget -qO- $(youtube-dl --restrict-filenames -f bestaudio -g "+url+") | ffmpeg -loglevel panic -i - -f mp3 -", maxBuffer: 1024 * 1024 * 500, (err, stdout, stderr) ->
	// 		if err
	// 			res.status(502).end(""+err)
	// 		else
	// 			res.setHeader "Content-Type", "audio/mpeg"
	// 			res.end stdout
	// 	###


	defaultRouter.get('/', (req, res) => res.sendFile('index.html', htmloptions))
	defaultRouter.get('/popout', (req, res) => res.sendFile('popout.html', htmloptions))
	defaultRouter.get('/livestream.html', (req, res) => res.sendFile('livestream.html', htmloptions))

	defaultRouter.get('/stream', (req, res) => res.redirect(config.streamurl+config.icecast.mounts[0]))

	defaultRouter.get('/auth/twitter', passport.authenticate('twitter'))
	defaultRouter.get('/auth/twitter/callback', passport.authenticate('twitter', {
		successRedirect: '/',
		failureRedirect: '/login',
		failureFlash: 'Login failed',
		//successFlash: 'Login succeeded'
	}))

	defaultRouter.get('/auth/poniverse', passport.authenticate('poniverse'))
	defaultRouter.get('/auth/poniverse/callback', passport.authenticate('poniverse', {
		successRedirect: '/',
		failureRedirect: '/login',
		failureFlash: 'Login failed',
		//successFlash: 'Login succeeded'
	}))

	defaultRouter.get('/logout', (req, res) => {
		if (req.isAuthenticated()) {
			req.logout()
			delete req.session
			//req.flash('info', 'You are now logged out')
		}
		res.redirect('/')
	})

	apiRouter.get('/config', (req, res) => res.json(simpleconfig()))

	apiRouter.get('/user', (req, res) => {
		if (req.user) {
			User.findWithAuth(req.user.id, (err, user) => res.json(user))
		} else {
			res.json({})
		}
	})

	apiRouter.post('/show/create', (req, res) => {
		if (req.user) {
			User.createShow(req.user.id, req.body, (err) => {
				if (err) {
					console.error('Error creating show: '+err)
					res.json({error: ''+err})
					return
				}
				res.json('ok')
			})
		} else {
			res.json({error: 'not logged in'})
		}
	})

	apiRouter.delete('/show/:id', (req, res) => {
		if (req.user) {
			User.removeShow(req.user.id, req.params.id, (err) => {
				if (err) {
					console.error('Error removing show: '+err)
					res.json({error: ''+err})
					return
				}
				res.json('ok')
			})
		} else {
			res.json({error: 'not logged in'})
		}
	})

	apiRouter.get('/show', (req, res) => {
		if (req.user) {
			User.getShows(req.user.id, (err, list) => {
				if (err) {
					console.error('Error fetching show: '+err)
					res.json({error: ''+err})
					return
				}
				res.json(list)
			})
		} else {
			res.json({error: 'not logged in'})
		}
	})

	apiRouter.get('/show/:id/updatetoken', (req, res) => {
		if (req.user) {
			User.updateToken(req.user.id, req.params.id, (err, token) => {
				if (err) {
					console.error('Error updating token: '+err)
					res.json({error: ''+err})
					return
				}
				res.json({token: token})
			})
		} else {
			res.json({error: 'not logged in'})
		}
	})

	/*
	apiRouter.get '/flash', (req, res) ->
		res.json req.flash()

	defaultRouter.get '/flash/:name', (req, res) ->
		res.json req.flash req.params.name
	*/

	apiRouter.get('/now/art/:size', (req, res) => {

		let size = req.params.size
		if (size === 'full') {
			size == 'original'
		}
		let sizes = ['original', 'tiny', 'small']
		if (sizes.indexOf(size) === -1) {
			res.redirect(sizes[0])
			return
		}
		let info = liquid.getImage()
		let data, type
		if (info) {
			if (size === 'original') {
				data = info.original
				type = info.type
			} else {
				data = info.sizes[size]
				type = {ext: 'png', mime: 'image/png'}
			}
		}

		if (info && data) {
			nocache(res)
			res.type(type.mime)
			res.send(data)
		} else {
			nocache(res)
			res.type('png')
			res.sendFile('cover-small.png', {root: __dirname + '/../static/img/cover/'})
		}
	})

	/*
	defaultRouter.get '/now/json', (req, res) ->
		cors(res)
		res.setHeader "Content-Type", "application/json"
		res.sendFile 'json', root: __dirname+'/../util/now/'
	*/

	apiRouter.get('/status', (req, res) => {
		cors(res)
		res.json({
			meta: liquid.getMeta(),
			info: icecast.getInfo(),
			livestream: livestream.getInfo()
		})
	})

	/*
	defaultRouter.get '/lastfm/recent', (req, res) ->
		cors(res)

		fetchJSON 'http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+config.lastfm.username+'&api_key='+config.lastfm.api.key+'&format=json&limit='+config.lastfm.api.limit+'&extended=1', null, (err, data) ->
			if err
				res.end 'error: ' + err
			else
				res.json data
	*/

	apiRouter.get('/history', (req, res) => {
		let imagesize = +(req.query.imagesize || 1)
		if (imagesize < 0) imagesize = 0
		if (imagesize > 3) imagesize = 3
		let limit = +(req.query.limit || config.lastfm.api.limit)
		if (limit < 1) limit = 1
		if (limit > config.lastfm.api.limit) limit = config.lastfm.api.limit
		cors(res)

		fetchJSON('http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user='+config.lastfm.username+'&api_key='+config.lastfm.api.key+'&format=json&limit='+limit+'&extended=1', null, function (err, data) {
			let tracks = []
			if (err) {
				console.log('lastfm error: ' + err, data)
			} else {
				try {
					let list = data.recenttracks.track
					if (!Array.isArray(list)) {
						list = [list]
					}
					for (let t of list) {
						let attr = t['@attr'] || {}

						let track = {
							title: t.name,
							artist: t.artist.name,
							album: t.album['#text'],
							art: t.image[imagesize]['#text'] || t.artist.image[imagesize]['#text'] || (config.general.baseurl+'img/cover/cover-small.png'),
							timestamp: t.date ? +t.date.uts : Date.now()/1000|0,
							url: t.url
						}
						// track.art = tracks.art.replace('http://', 'https://')
						if (attr.nowplaying) {
							delete track.timestamp
						}
						track.text = track.artist+' - '+track.title
						tracks.push(track)
					}

				} catch (e) {
					console.log('lastfm error: ' + e, data && data.recenttracks && data.recenttracks.track)
					tracks = []
				}
			}
			res.json(tracks)
		})
	})

	apiRouter.get('/radio', (req, res) => {
		cors(res)

		let meta = liquid.getMeta()
		let text = (meta.artist ? meta.artist + ' - ' : '') + meta.title
		let songInfo = {
			title: meta.title,
			artist: meta.artist,
			album: meta.album,
			albumartist: meta.albumartist,
			text: text,
			url: meta.url || (meta.artist && meta.title ? 'http://www.last.fm/music/'+encodeURIComponent(meta.artist)+'/_/'+encodeURIComponent(meta.title) : ''),
			year: meta.year,
			art: meta.art || config.server.api_prefix+'/now/art/small',
			bitrate: meta.bitrate,
			ext: meta.ext,
			source: meta.source
		}

		songInfo.id = Song.getSongHash(songInfo)

		let events = scheduler.getEvents()
		events.calendar = config.google.calendarId
		events.now = new Date()

		o = {
			general: {
				name: config.radio.title,
				description: config.radio.description,
				logo: config.general.baseurl+'img/icons/parasprite-radio.png',
				url: config.radio.url,
				irc: config.general.irc,
				twitter_handle: config.general.twitter
			},

			radio: {
				online: icecast.isOnline(),
				listeners: icecast.getListenerCount(),
				listener_peak: icecast.getListenerPeak(),

				song_info: songInfo,

				streams: icecast.getStreams(),

				live: meta.live,

				url_history: config.server.api_prefix+'/history?limit=5'
			},

			livestream: {
				online: livestream.isOnline(),
				viewers: livestream.getViewCount(),
				url: config.general.baseurl+'#livestream',
				url_iframe: config.general.baseurl+'livestream.html',
				url_thumbnail: config.livestream.url_thumbnail,
				url_rtmp: config.livestream.url_rtmp,
				url_dash: config.livestream.url_dash,
				url_hls: config.livestream.url_hls
			},

			events: events
		}

		res.json(o)
	})

	apiRouter.get('/sse', sse.handle)



	// \/ ADMIN ENDPOINTS \/ //

	adminRouter.get('/*', (req, res) => res.sendFile('admin.html', htmloptions))
	adminRouter.get('/', (req, res) => res.redirect('/admin/'))


	apiRouter.get('/update', isAdmin, (req, res) => {
		mpd.update(function (err) {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = {error: null}
			}
			res.json(json)
		})
	})

	apiRouter.get('/search', isAdmin, (req, res) => {
		let query = req.query.q
		let type = req.query.t || 'any'
		let mpdres = null
		let mpdids = null
		let eqres = null
		let eqids = null
		let eqbeatsQuery

		function finalize() {
			let final = [].concat(mpdres)
			eqres = eqres.filter((t) => {
				return mpdids.indexOf(t.id) === -1
			})
			final = final.concat(eqres)
			res.json(final)
		}

		mpd.search(type, query, function (err, data) {
			mpdres = []
			mpdids = []
			if (!err) {
				data.forEach((t) => {
					t.source = 'local'
					t.id = Song.getSongHash(t)
					mpdids.push(t.id)
					mpdres.push(t)
				})
			}

			if (eqres) {
				finalize()
			}
		})

		if (type == 'any' || type == 'title' || type == 'artist') {

			if (type === 'title') {
				eqbeatsQuery = 'title:'+query
			}
			else if (type === 'artist') {
				eqbeatsQuery = 'artist:'+query
			}
			else {
				eqbeatsQuery = query
			}

			EqBeats.querySearch(eqbeatsQuery, function (err, data) {
				eqres = []
				eqids = []
				if (!err) {
					data.forEach((t) => {
						let o = {
							title: t.title,
							artist: t.artist.name,
							date: new Date(t.timestamp*1000).getFullYear(),
							'last-modified': new Date(t.timestamp*1000),
							url: t.link,
							art: t.download.art,
							source: 'eqbeats'
						}
						o.id = Song.getSongHash(o)
						eqres.push(o)
						eqids.push(o.id)
					})
				}
				if (mpdres) {
					finalize()
				}
			})

		} else {
			eqres = []
			eqids = []
		}
	})


	/*
	adminRouter.get '/albums', (req, res) ->
		mpd.getAlbums (err, albums) ->
			if err
				json = []
			else
				json = albums
			res.json json

	adminRouter.get '/artists', (req, res) ->
		mpd.getArtists (err, artists) ->
			if err
				json = []
			else
				json = artists
			res.json json

	adminRouter.get '/track', (req, res) ->
		filename = req.query.f || null
		if filename is null
			res.json error: 'No filename provided'
		else
			mpd.getTrackInfo cleanpath(filename), (err, info) ->
				if err
					json = error: err
				else
					json = info

				res.json json
	*/

	apiRouter.get('/files/*', isAdmin, (req, res) => {
		let filename = cleanpath(req.params[0])
		mpd.lsinfo(filename, (err, list) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = list
			}
			res.json(json)
		})
	})

	apiRouter.get('/playlists', isAdmin, (req, res) => {
		mpd.getPlaylists((err, list) => {
			let json
			if (err) {
				json = []
			} else {
				json = list
			}
			res.json(json)
		})
	})

	apiRouter.get('/playlist/:name', isAdmin, (req, res) => {
		let name = req.params.name
		mpd.getPlaylist(name, (err, list) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = list
			}
			res.json(json)
		})
	})


	/*
	adminRouter.get '/stream/*', (req, res) ->
		filename = cleanpath req.params[0]
		mpd.getTrackInfo filename, (err, info) ->
			if info and info.file == filename
				res.sendFile filename,
					root: config.media_dir
			else
				res.status(404).end('File not found in the music database')
	*/

	apiRouter.get('/metadata/*', isAdmin, (req, res) => {
		let filename = cleanpath(req.params[0])
		let stream = fs.createReadStream(config.media_dir+'/'+filename)
		let parser = mm(stream)
		parser.on('metadata', (result) => res.send(JSON.stringify(result)))
		parser.on('done', (err) => {
			if (err) {
				res.send(''+err)
			}
			stream.destroy()
		})
		stream.on('error', (err) => res.send(''+err))
	})

	/*
	adminRouter.get '/set/*', (req, res) ->
		filename = cleanpath req.params[0]
		imageFromFile path.join(config.media_dir, filename), (err, type, data) ->
			if err
				res.end ''+err
			else
				res.setHeader "Content-Type", type
				res.end data

		##id3 {file: config.media_dir+'/'+filename, type: id3.OPEN_LOCAL}, (err, tags) ->
			if err
				res.status(500).end err+''
			else

				if tags.v2 and tags.v2.image
					res.setHeader("Content-Type", tags.v2.image.mime);
					buffer = new Buffer(new Uint8Array(tags.v2.image.data));
					res.end buffer.toString('binary'), 'binary'
				else
					res.end 'no image data'
	*/

	apiRouter.get('/queue/list', isAdmin, (req, res) => {
		liquid.queue.getList((err, list) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = list
			}
			res.json(json)
		})
	})

	apiRouter.get('/queue', isAdmin, (req, res) => {
		let item = req.query.add
		let queueId = req.query.id || 2
		//if (item.indexOf('/') === 0)
		//	item = config.general.media_dir+item
		liquid.queue.add(queueId, 'smart:'+item, (err) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = {error: null}
			}
			res.json(json)
		})
	})

	apiRouter.get('/announce', isAdmin, (req, res) => {
		liquid.announce(req.query.message, (err) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = {error: null}
			}
			res.json(json)
		})
	})

	apiRouter.get('/skip', isAdmin, (req, res) => {
		liquid.skip((err) => {
			let json
			if (err) {
				json = {error: err}
			} else {
				json = {error: null}
			}
			res.json(json)
		})
	})

	apiRouter.get('/listeners', isAdmin, (req, res) => res.json(icecast.getListeners()))


	app.use('/api', apiRouter)
	app.use('/', defaultRouter)
	app.use('/build/', express.static(__dirname + '/../build/', { maxAge: 365*24*60*60*1000 }))
	app.use('/', express.static(__dirname + '/../build/icons/', { maxAge: 365*24*60*60*1000 }))
	app.use('/', express.static(__dirname + '/../static', { maxAge: 365*24*60*60*1000 }))

	app.use('/admin', isAdmin, adminRouter)
	app.use('/internal/', isInternal, internalRouter)

}
