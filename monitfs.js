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
                        isFile: isFile
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
    var MONITOR = {},
        ROOT = undefined,
        NOTIFY = undefined,
        RE_IGNORE_FILE = undefined,
        RE_IGNORE_DIR = undefined,
        getEntries = function( entry ){
            var re = new RegExp( '^' + ( entry === '/' ? '' : entry ) + 
                                 '/.+$', 'mg' );
            return Object.keys( MONITOR ).join('\n').match( re )||[];
        },
        setIgnoreFile = function( arr ){
            RE_IGNORE_FILE = verifyIgnores( arr );
        },
        setIgnoreDir = function( arr ){
            RE_IGNORE_DIR = verifyIgnores( arr );
        },
        eventCb = function( evt, name )
        {
            var self = this;
            fs.exists( this.path, function( bool )
            {
                if( !bool ){
                    unregister( self.entry );
                }
                else if( !self.isFile ){
                    readDir( self.path );
                }
            });
        },
        register = function( entry, path, isFile )
        {
            if( entry && !MONITOR[entry] )
            {
                MONITOR[entry] = fs.watch( path, eventCb );
                MONITOR[entry].entry = entry;
                MONITOR[entry].path = path;
                MONITOR[entry].isFile = isFile;
                NOTIFY( 'watch', entry, path, isFile );
            }
        },
        unregister = function( entry )
        {
            if( entry && MONITOR[entry] )
            {
                var target = MONITOR[entry];
                
                delete MONITOR[entry];
                target.close();
                NOTIFY( 'unwatch', entry, target.path, target.isFile );
                
                if( !target.isFile ){
                    getEntries( entry ).forEach( unregister );
                }
            }
        },
        unwatch = function(){
            Object.keys( MONITOR ).forEach( unregister );
        },
        watch = function( dir, notify )
        {
            if( typeof notify !== 'function' ){
                throw new TypeError( 'notify is not function' );
            }
            
            ROOT = dir;
            NOTIFY = notify;
            // register root dir
            register( '/', ROOT, false );
            readDir( ROOT );
        },
        readDir = function( dir )
        {
            traverse( dir, function( err, entries )
            {
                if( err ){
                    NOTIFY( 'error', err );
                }
                else
                {
                    var wlist = [];
                    
                    entries.forEach(function(item)
                    {
                        var entry = item.path.replace( ROOT, '' );
                        
                        if( item.isFile )
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
            register( entry, item.path, true );
            
            return true;
        },
        checkDir = function( item, entry )
        {
            if( RE_IGNORE_DIR.test( entry ) ){
                return false;
            }
            // register dir entry
            register( entry, item.path, false );
            
            return true;
        };
    
    this['setIgnoreFile'] = setIgnoreFile;
    this['setIgnoreDir'] = setIgnoreDir;
    this['watch'] = watch;
    this['unwatch'] = unwatch; 
    this['toSafePath'] = toSafePath;
    this['traverse'] = traverse;
    
    // init
    RE_IGNORE_FILE = verifyIgnores( DEFAULT_IGNORE_FILE );
    RE_IGNORE_DIR = verifyIgnores( DEFAULT_IGNORE_DIR );
}

monitfs.toSafePath = toSafePath;
monitfs.traverse = traverse;

return monitfs;

}
// @src:end
module.exports = init_monitfs();
