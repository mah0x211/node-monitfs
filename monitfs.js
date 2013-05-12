/*
 *  monitfs.js
 *
 *  Created by Masatoshi Teruya on 13/05/08.
 *  Copyright 2013 Masatoshi Teruya. All rights reserved.
 *
 */
// @src:begin
function init_monitfs(){
"use strict";

var pkg = {
        path: require('path'),
    },
    // globals
    util = require('util'),
    events = require('events'),
    fs = require('fs'),
    // constants
    DEFAULT_IGNORE_FILE = [
        '^.gitignore',
        '^.DS_Store'
    ],
    DEFAULT_IGNORE_DIR = [
        '/.git$'
    ];

function verifyIgnores( arr )
{
    var regexp = [],
        ignore = [];
    
    arr.forEach(function(str)
    {
        if( ignore.indexOf(str) === -1 ){
            ignore.push( str );
            regexp.push( new RegExp( str ) );
        }
    });
    
    return {
        regexp: regexp,
        test: function(item)
        {
            for( var i = 0, len = this.regexp.length; i < len; i++ )
            {
                if( this.regexp[i].test( item ) ){
                    return true;
                }
            }
        }
    }
}

function toSafePath( var_args )
{
    var path = Array.prototype.slice.call( arguments ),
        root = path.shift() + '/';
    
    return pkg.path.normalize( root + pkg.path.resolve( '/', path.join('/') ) );
};

function traverse( root, cb )
{
    var result = [],
        entries = [],
        nextEntry = function()
        {
            var entry = entries.shift();
            
            if( entry ){
                statEntry( entry );
            }
            else {
                cb( undefined, result );
            }
        },
        statEntry = function( path )
        {
            fs.stat( path, function( err, stat )
            {
                var isFile = false;
                
                if( err ){
                    cb( err );
                }
                else if( !( isFile = stat.isFile() ) && !stat.isDirectory() ){
                    nextEntry();
                }
                else
                {
                    result.push({
                        path: path,
                        stat: {
                            isFile: isFile,
                            mode: stat.mode,
                            size: stat.size,
                            atime: stat.atime,
                            mtime: stat.mtime,
                            ctime: stat.ctime
                        }
                    });
                    
                    if( isFile ){
                        nextEntry();
                    }
                    else
                    {
                        fs.readdir( path, function( err, items )
                        {
                            if( err ){
                                cb( err );
                            }
                            else
                            {
                                items.forEach(function( entry ){
                                    entries.push( toSafePath( path, entry ) );
                                });
                                nextEntry();
                            }
                        });
                    }
                }
            });
        };
    
    statEntry( root );
};


function monitfs()
{
    var self = this,
        MONITOR = {},
        ROOT = undefined,
        RE_IGNORE_FILE = undefined,
        RE_IGNORE_DIR = undefined,
        getEntries = function( entry ){
            var re = new RegExp( '^' + ( entry === '/' ? '' : entry ) + 
                                 '/.+$', 'mg' );
            return Object.keys( MONITOR ).join('\n').match( re )||[];
        },
        eventCb = function( evt, name )
        {
            var self = this;
            fs.exists( this.path, function( bool )
            {
                if( !bool ){
                    unregister( self.entry );
                }
                else if( self.stat.isFile ){
                    update( self.entry, self.path );
                }
                else {
                    readDir( self.path );
                }
            });
        },
        update = function( entry, path )
        {
            fs.stat( path, function( err, stat )
            {
                if( err ){
                    unregister( entry );
                    self.emit( 'error', err );
                }
                else
                {
                    unregister( entry, true );
                    register( entry, path, {
                        isFile: stat.isFile(),
                        mode: stat.mode,
                        size: stat.size,
                        atime: stat.atime,
                        mtime: stat.mtime,
                        ctime: stat.ctime
                    });
                }
            });
        },
        register = function( entry, path, stat )
        {
            if( entry && !MONITOR[entry] )
            {
                MONITOR[entry] = fs.watch( path, eventCb );
                MONITOR[entry].entry = entry;
                MONITOR[entry].path = path;
                MONITOR[entry].stat = stat;
                self.emit( 'watch', entry, path, stat );
            }
        },
        unregister = function( entry, silently )
        {
            if( entry && MONITOR[entry] )
            {
                var target = MONITOR[entry];
                
                delete MONITOR[entry];
                target.close();
                if( !silently ){
                    self.emit( 'unwatch', entry, target.path, target.stat );
                }
                
                if( !target.stat.isFile ){
                    getEntries( entry ).forEach( unregister );
                }
            }
        },
        readDir = function( dir )
        {
            traverse( dir, function( err, entries )
            {
                if( err ){
                    self.emit( 'error', err );
                }
                else
                {
                    var wlist = [];
                    
                    entries.forEach(function(item)
                    {
                        var entry = item.path.replace( ROOT, '' );
                        
                        if( item.stat.isFile )
                        {
                            if( !checkFile( item, entry ) ){
                                return;
                            }
                        }
                        else if( !checkDir( item, entry ) ){
                            return;
                        }
                        wlist.push( entry );
                    });
                    
                    // unregister removed entries
                    getEntries( dir.replace( ROOT, '' ) )
                    .forEach(function(entry)
                    {
                        // remove from unregister list
                        if( wlist.indexOf( entry ) === -1 ){
                            unregister( entry );
                        }
                    });
                }
            });
        },
        checkFile = function( item, entry )
        {
            if( RE_IGNORE_FILE.test( pkg.path.basename( item.path ) ) ){
                return false;
            }
            // register file entry
            register( entry, item.path, item.stat );
            
            return true;
        },
        checkDir = function( item, entry )
        {
            if( RE_IGNORE_DIR.test( entry ) ){
                return false;
            }
            // register dir entry
            register( entry, item.path, item.stat );
            
            return true;
        };
    
    events.EventEmitter.call( self );
    this.setIgnoreFile = function( arr ){
        RE_IGNORE_FILE = verifyIgnores( arr );
    };
    this.setIgnoreDir = function( arr ){
        RE_IGNORE_DIR = verifyIgnores( arr );
    };
    this.watch = function( dir ){
        ROOT = dir;
        // register root dir
        register( '/', ROOT, { isFile: false } );
        readDir( ROOT );
    };
    this.unwatch = function(){
        Object.keys( MONITOR ).forEach( unregister );
    }; 
    this.toSafePath = toSafePath;
    this.traverse = traverse;
    
    // init
    RE_IGNORE_FILE = verifyIgnores( DEFAULT_IGNORE_FILE );
    RE_IGNORE_DIR = verifyIgnores( DEFAULT_IGNORE_DIR );
}

util.inherits( monitfs, events.EventEmitter );
monitfs.toSafePath = toSafePath;
monitfs.traverse = traverse;

return monitfs;

}
// @src:end
module.exports = init_monitfs();
