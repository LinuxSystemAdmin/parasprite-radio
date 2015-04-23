
net = require 'net'
path = require 'path'
fetchJSON = require(__dirname+'/utils').fetchJSON

timeout = 5000

module.exports = (config) ->

	liqReady = false
	client = null
	liqData = ""
	cmdQueue = []

	liqOnReady = ->
		console.log 'Liquidsoap: Ready!'
		liqReady = true

	liqOnData = (data) ->
		s = data.toString('binary')
		liqData += s

		a = s.split "\r\n"
		a.pop()
		if a[a.length-1] == "END"
			d = liqData.split "\r\n"
			d.pop() # remove last newline
			d.pop() # remove END
			liqData = ""
			cb = cmdQueue.shift() # get command first in queue
			if cb
				if d.length == 1
					d = d[0].split "\n"
					if d.length == 1
						d = d[0]
				if Array.isArray d
					o = {}
					for line, i in d
						pos = line.indexOf "="
						if pos != -1
							key = line.substr 0, pos
							val = line.substr pos+1
							o[key] = JSON.parse val
					d = o
					
				cb null, d

	liqOnError = (err) ->
		console.error "Liquidsoap: Socket error: "+err

	liqOnEnd = ->
		console.log 'Liquidsoap: Socket ended'
		client = null
		liqReady = false
		liqData = ""
		cmdQueue = []

	liqConnect = ->
		console.log "Liquidsoap: Connecting.."
		client = net.connect
			host: config.liquidsoap.host || "localhost"
			port: config.liquidsoap.port || 1234
		client.once 'connect', liqOnReady
		client.on 'data', liqOnData
		client.once 'error', liqOnError
		client.once 'end', liqOnEnd


	liqCheck = (cb) ->
		if liqReady
			cb null
		else
			if client == null
				liqConnect()
			sentCb = false
			errorMsg = null

			client.once 'connect', ->
				unless sentCb
					sentCb = true
					cb null
			client.once 'error', (err) ->
				errorMsg = err
			client.once 'end', ->
				unless sentCb
					sentCb = true
					cb ''+(errorMsg or 'end')

			setTimeout ->
				unless sentCb or false
					sentCb = true
					if client
						client.end()
					cb 'timeout'
			, timeout

	liqCommand = (key, value="", cb) ->
		command = key+" "+value+"\r\n";
		liqCheck (err) ->
			if err
				console.warn "Liquidsoap: Check error: " + err
				cb err, null
			else
				client.write command, 'utf8'
				cmdQueue.push (err, data) ->
					if err
						console.warn "Liquidsoap " + name+" " + args.join(' ') + ": " + err
						cb err, null
					else
						cb null, data

	dbUpdateCallbacks = []

	# no need to connect on startup at the moment
	#liqConnect()

	metadata = {}

	API =
		queue:
			getList: (cb) ->
				liqCommand "request.queue", "", (err, data) ->
					if data == ""
						cb err, []
					else
						list = data.split " "
						meta = []
						f = (i) ->
							liqCommand "request.metadata", list[i], (err, data) ->
								if err or !data.filename
									
								else
									data.file = data.filename.replace(config.media_dir+"/", "")
									delete data.filename
									meta.push data
								++i
								if i < list.length
									f i
								else
									cb null, meta

						f 0

			add: (path, cb) ->
				liqCommand "request.push", config.media_dir+"/"+path, (err, data) ->
					cb err

			ignore: (rid, cb) ->
				liqCommand "request.ignore", rid, (err, data) ->
					cb err
			consider: (rid, cb) ->
				liqCommand "request.consider", rid, (err, data) ->
					cb err

		announceMessage: (message, cb) ->
			liqCommand 'announce.push', 'say:'+message, (err, data) ->
				cb err

		setMeta: (m) ->
			metadata.title  = m.title or path.basename(m.filename, path.extname(m.filename))
			metadata.artist = m.artist or null
			metadata.album  = m.album or null
			metadata.albumartist = m.albumartist or null
			metadata.url    = m.url or null
			metadata.year   = +m.year or null

		updateMeta: (cb) ->
			fetchJSON 'http://'+config.liquidsoap.host+':'+config.liquidsoap.harbor_port+'/getmeta', (err, data) =>
				if err
					console.log "Liquidsoap: Couldn't fetch metadata: "+err
				else
					@setMeta data

		getMeta: ->
			return metadata


	API.updateMeta()

						
	API