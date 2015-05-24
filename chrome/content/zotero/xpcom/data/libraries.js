/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.Libraries = new function () {
	let _libraryData = {},
		_userLibraryID,
		_publicationsLibraryID,
		_libraryDataLoaded = false;
	
	Zotero.defineProperty(this, 'userLibraryID', {
		get: function() { 
			if (!_libraryDataLoaded) {
				throw new Error("Library data not yet loaded");
			}
			return _userLibraryID;
		}
	});
	
	Zotero.defineProperty(this, 'publicationsLibraryID', {
		get: function() {
			if (!_libraryDataLoaded) {
				throw new Error("Library data not yet loaded");
			}
			return _publicationsLibraryID;
		}
	});
	
	this.init = Zotero.Promise.coroutine(function* () {
		// Library data
		var sql = "SELECT * FROM libraries";
		var rows = yield Zotero.DB.queryAsync(sql);
		for (let i=0; i<rows.length; i++) {
			let row = rows[i];
			_libraryData[row.libraryID] = parseDBRow(row);
			if (row.libraryType == 'user') {
				_userLibraryID = row.libraryID;
			}
			else if (row.libraryType == 'publications') {
				_publicationsLibraryID = row.libraryID;
			}
		}
		_libraryDataLoaded = true;
	});
	
	
	this.exists = function (libraryID) {
		return _libraryData[libraryID] !== undefined;
	}
	
	
	this.getAll = function () {
		return [for (x of Object.keys(_libraryData)) parseInt(x)]
	}
	
	
	this.add = Zotero.Promise.coroutine(function* (type) {
		Zotero.DB.requireTransaction();
		
		switch (type) {
			case 'group':
				break;
			
			default:
				throw new Error("Invalid library type '" + type + "'");
		}
		
		var libraryID = yield Zotero.ID.get('libraries');
		
		var sql = "INSERT INTO libraries (libraryID, libraryType) VALUES (?, ?)";
		yield Zotero.DB.queryAsync(sql, [libraryID, type]);
		
		// Re-fetch from DB to get auto-filled defaults
		var sql = "SELECT * FROM libraries WHERE libraryID=?";
		var row = yield Zotero.DB.rowQueryAsync(sql, [libraryID]);
		return _libraryData[row.libraryID] = parseDBRow(row);
	});
	
	
	this.getName = function (libraryID) {
		var type = this.getType(libraryID);
		switch (type) {
			case 'user':
				return Zotero.getString('pane.collections.library');
			
			case 'publications':
				return Zotero.getString('pane.collections.publications');
			
			case 'group':
				var groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
				var group = Zotero.Groups.get(groupID);
				return group.name;
			
			default:
				throw new Error("Unsupported library type '" + type + "' in Zotero.Libraries.getName()");
		}
	}
	
	
	this.getType = function (libraryID) {
		if (!this.exists(libraryID)) {
			throw new Error("Library data not loaded for library " + libraryID);
		}
		return _libraryData[libraryID].type;
	}
	
	
	/**
	 * @param {Integer} libraryID
	 * @return {Integer}
	 */
	this.getVersion = function (libraryID) {
		if (!this.exists(libraryID)) {
			throw new Error("Library data not loaded for library " + libraryID);
		}
		return _libraryData[libraryID].version;
	}
	
	
	/**
	 * @param {Integer} libraryID
	 * @param {Integer} version
	 * @return {Promise}
	 */
	this.setVersion = Zotero.Promise.coroutine(function* (libraryID, version) {
		version = parseInt(version);
		var sql = "UPDATE libraries SET version=? WHERE libraryID=?";
		yield Zotero.DB.queryAsync(sql, [version, libraryID]);
		_libraryData[libraryID].version = version;
	});
	
	
	this.getLastSyncTime = function (libraryID) {
		return _libraryData[libraryID].lastSyncTime;
	};
	
	
	/**
	 * @param {Integer} libraryID
	 * @param {Date} lastSyncTime
     */
	this.setLastSyncTime = function (libraryID, lastSyncTime) {
		var lastSyncTime = Math.round(lastSyncTime.getTime() / 1000);
		return Zotero.DB.valueQueryAsync(
			"UPDATE libraries SET lastsync=? WHERE libraryID=?", [lastSyncTime, libraryID]
		);
	};
	
	
	this.isEditable = function (libraryID) {
		var type = this.getType(libraryID);
		switch (type) {
			case 'user':
			case 'publications':
				return true;
			
			case 'group':
				var groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
				var group = Zotero.Groups.get(groupID);
				return group.editable;
			
			default:
				throw new Error("Unsupported library type '" + type + "' in Zotero.Libraries.getName()");
		}
	}
	
	
	this.isFilesEditable = function (libraryID) {
		var type = this.getType(libraryID);
		switch (type) {
			case 'user':
			case 'publications':
				return true;
			
			case 'group':
				var groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
				var group = Zotero.Groups.get(groupID);
				return group.filesEditable;
			
			default:
				throw new Error("Unsupported library type '" + type + "' in Zotero.Libraries.getName()");
		}
	}
	
	this.isGroupLibrary = function (libraryID) {
		if (!_libraryDataLoaded) {
			throw new Error("Library data not yet loaded");
		}
		
		return this.getType(libraryID) == 'group';
	}
	
	function parseDBRow(row) {
		return {
			id: row.libraryID,
			type: row.libraryType,
			version: row.version,
			lastSyncTime: row.lastsync != 0 ? new Date(row.lastsync * 1000) : false
		};
	}
}