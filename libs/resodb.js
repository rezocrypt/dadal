// Requiring necessary libraries
const fs = require('fs');
const crypto = require('crypto');

// Defining cache supporting variables
const dbcache = {
    'path': {
        'lastupdate': new Date(),
        'data': ''
    }
}
const max_cache_size = 100_000_000;
const max_cached_object_size = 500_000_000;
const max_cache_seconds = 1000;
const cache_checking_seconds = 2;

// Function for always checking if there is no out of date items in cache
let cache_update = (() => {
    setInterval(() => {
        for (let cache_file in dbcache) {
            let date = new Date();
            let update_date = dbcache[cache_file]['lastupdate'];
            let seconds_passed = (date - update_date) / 1000;
            if (seconds_passed > max_cache_seconds) {
                delete dbcache[cache_file]
            }
        }
    }, cache_checking_seconds * 1000)
})();

// Definng errors class for ResoDB
class ErrorResoDB extends Error {
    // Defining global variables for error
    message;
    main_error;
    code;

    // Constructor which will receive error info
    constructor(code = 0, main_error = null) {
        // In this object will be saved error codes with their messages
        const error_codes = {
            0: 'Some unknown error',
            191: 'Error while converting string to JSON',
            192: 'Cannot create new DB file because it already exists and recreating option is not allowed by you',
            193: 'The data which you give is not a JSON object',
            194: 'Error while writing file in disk',
            195: 'Error while reading DB file',
            196: 'Error while converting DB file data to JSON',
            197: 'Error while encrypting given data with given password.',
            198: 'Error while decrypting given data with given password.',
        }

        // Getting message from error_codes
        let message = error_codes[code] || error_codes[0];

        // Calling super
        super(message);

        // Defining [this] variables
        this.code = code;
        this.message = message;
        this.main_error = main_error;
    }

    // Method for displaying error data
    display() {
        console.log(this.get_data());
    }


    /* Some not very necessary methods thay MAYBE necessary */

    // Method which just returns message of error
    get_message() {
        return this.message;
    }

    // Method which just returns code of error
    get_code() {
        return this.code
    }

    // Method which just returns main error (if exists) of error
    get_main_error() {
        return this.main_error;
    }

    // Method for getting all data about error
    get_data() {
        return {
            message: this.message,
            code: this.code,
            main_error: this.main_error
        }
    }

}

// Defining DB class of Resonance
class ResoDB {

    // Defining constructor which needs path for DB
    constructor(path, password = null, caching = true, ensure = true, default_data = {}) {
        // Parsing variables to [this]
        this.path = path;
        this.default_data = default_data;
        this.caching = caching;
        if (password !== null) {
            this.encrypted = true;
            this.password = password;
        }
        if (ensure === true) {
            if (!fs.existsSync(path)) {
                let feedback = this.ensure();
                if (feedback instanceof Error) { return feedback; };
            }
        }
    }

    // Private method which checks if object is normal for converting to string and save in DB file
    #check_data(obj) {
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && !(obj instanceof Date) && !(obj instanceof RegExp)) {
            return true;
        }
        return false;
    }

    // Private method for caching DB file
    #cache() {
        if (fs.existsSync(this.path) && new Blob([JSON.stringify(dbcache)]).size < max_cache_size && max_cached_object_size >= new Blob([JSON.stringify(this.dbdata)]).size) {
            dbcache[this.path] = {
                lastupdate: new Date(),
                data: Object.assign({}, this.dbdata)
            }
        }
    }

    // Private method for getting data if given db is in cache
    #in_cache() {
        if (dbcache[this.path] === undefined) { return false; };
        let last_cached_date = dbcache[this.path]['lastupdate'];
        const last_modified_date = fs.statSync(this.path).mtime;
        console.log(last_cached_date - last_modified_date);
        if (last_cached_date - last_modified_date > 0) {
            let data = dbcache[this.path]['data']
            return data;
        }
        return false;
    }

    // Private method for encrypting data
    #encrypt(data, password) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }

    // Private method for decrypting data
    #decrypt(encryptedData, password) {
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(password, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Method for creating db if it does not exist and doing nothing if it exists
    ensure() {
        let create_feedback = this.create(this.default_data, true);
        if (create_feedback instanceof Error) { return create_feedback }
        return true;
    }

    // Method for creating DB file
    create(data = {}, create_if_exists = true) {
        // Defining variable which will save data as string for writing in file
        let stringified_data;

        // Checking if the give data is a normal object
        if (this.#check_data(data) !== true) {
            return new ErrorResoDB(193);
        }

        // Checking the last time if there will be no error while converting to string
        try {
            stringified_data = JSON.stringify(data)
        } catch (error) {
            return new ErrorResoDB(191, error);
        }
        // Also checking if already existed db rewriting is available or not
        if (create_if_exists === false && fs.existsSync(this.path)) {
            return new ErrorResoDB(192);
        }


        // Also encrypting data if encryption is selected
        if (this.encrypted === true) {
            try {
                stringified_data = this.#encrypt(stringified_data, this.password)
            } catch (error) {
                return new ErrorResoDB(197, error);
            }
        }

        // Trying to write data in DB file
        try {
            fs.writeFileSync(this.path, stringified_data)
        } catch (error) {
            return new ErrorResoDB(194, error);
        }

        // Caching part
        if (this.caching === true) {
            this.dbdata = Object.assign({}, data);
            this.#cache()
        }

        // Returning true if everything is okay
        return true;
    }

    // Function for reading data from DB file
    read() {
        // First of all trying to find the given data in cache if it exists
        if (this.caching === true) {
            let data_in_cache = this.#in_cache();
            if (data_in_cache instanceof Error) {
                return data_in_cache;
            }

            if (data_in_cache !== false) {
                console.log('Henc cachic el stacav');
                return data_in_cache;
            }
        }

        // Trying to read data from DB file and saving in variable
        let db_file_data;
        try {
            db_file_data = fs.readFileSync(this.path);
            console.log('Jamerov bacec kardac');
        } catch (error) {
            return new ErrorResoDB(195, error);
        }

        // Also decrypting data if encryption is selected
        if (this.encrypted === true) {
            try {
                db_file_data = this.#decrypt(db_file_data.toString(), this.password)
            } catch (error) {
                return new ErrorResoDB(198);
            }
        }

        // Converring to json file
        let db_json_data;
        try {
            db_json_data = JSON.parse(db_file_data);
        } catch (error) {
            return new ErrorResoDB(196, error);
        }

        // Caching part
        if (this.caching === true) {
            this.dbdata = Object.assign({}, db_json_data);
            this.#cache()
            console.log('Cache arec');
        }

        // Returning data from DB file already converted to JSON
        return Object.assign({}, db_json_data);
    }

    // Function for writing data in db file
    write(data, async = false) {
        // Checking if the give data is a normal object
        if (this.#check_data(data) !== true) {
            return new ErrorResoDB(193);
        }

        // Defining variable which will save data as string for writing in file
        let stringified_data;

        // Checking the last time if there will be no error while converting to string
        try {
            stringified_data = JSON.stringify(data)
        } catch (error) {
            return new ErrorResoDB(191, error);
        }

        // Caching part
        if (this.caching === true) {
            this.#cache()
        }

        // Also encrypting data if encryption is selected
        if (this.encrypted === true) {
            try {
                stringified_data = this.#encrypt(stringified_data, this.password)
            } catch (error) {
                return new ErrorResoDB(197, error);
            }
        }

        // Trying to write data in DB file
        try {
            if (async === false) {
                fs.writeFileSync(this.path, stringified_data);
            }
            else if (async === true) {
                fs.writeFile(this.path, stringified_data, () => { })
            }
        } catch (error) {
            return new ErrorResoDB(194, error);
        }

        // Saving database data in local class
        this.dbdata = Object.assign({}, data);

        // Returning true if everything is done
        return true;
    }
}

// Exporting the main class as a whole module
module.exports = ResoDB;