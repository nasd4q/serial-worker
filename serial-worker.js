const logger = require("loglevel").getLogger("serial-worker");

class JobBuilder {

    static FAITH_DEFAULT = 3000;
    static PATIENCE_DEFAULT = 400;

    //#region setters setTitle withTask etc.
    /**
     * @param {string} title Description of the job. Optional.
     */
    setTitle(title) {
        this._title = title;
        return this;
    }

    /**
     * @param {() => Promise<void>} run A function that will be called once each time 
     * this job is attempted. Must return a promise which resolves when tasks are done.
     */
    withTask(run) {
        this._run = run;
        return this;
    }

    /** 
     * @param {() => Promise<boolean>} isDone A function that will be called multiple times 
     * to check job's status.
     * 
     * Detailed explanation  
     * `isDone()` will be called in two circumstances :  
     * Either just to check quickly if job is done or not : is called once and if resolves before
     * `Job.isDoneResponseTime`, then job might be skipped;   
     * Or to check that the job is indeed done 
     * after `Job.run()` has resolved : then `isDone()` is called repeatedly (waiting `Job.patience`
     * ms between last resolve to next call) until either `isDone()` resolves to true or 
     * `Job.faith` ms elapses.
     * 
     */
    withTarget(isDone) {
        this._isDone = isDone;
        return this;
    }

    /**
     * @param {number} faith Maximum number of milliseconds to wait for `Job.isDone()` to resolve 
     * to true after `Job.run()` has resolved. 
     * 
     * Defaults to 3000 (one second).
     * 
     * When checking if job is indeed done after `Job.run()` has resolved, `Job.isDone()` gets 
     * called repeatedly. `faith` provides a time limit after which, if no call to `isDone()``
     * has resolved to true, the job is considered failed.
     */
    setFaith(faith) {
        this._faith = faith;
        return this;
    }

    /**
     * @param {number} patience Number of milliseconds to wait after a call to `Job.isDone()` 
     * has resolved to false (or failed), before trying again and calling another time `isDone()`
     * 
     * Defaults to 400 (ms).
     * 
     * When checking if job is indeed done after `Job.run()` has resolved, `Job.isDone()` gets 
     * called repeatedly. `patience` provides a delay between two such calls.
     */
    setPatience(patience) {
        this._patience = patience;
        return this;
    }

    //#endregion

    build() {
        if (this._faith === null || this._faith === undefined) {
            this._faith = JobBuilder.FAITH_DEFAULT;
        }

        if (this._patience === null || this._patience === undefined) {
            this._patience = JobBuilder.PATIENCE_DEFAULT;
        }

        return new Job(
            this._title,
            this._run,
            this._isDone,
            this._faith,
            this._patience
        );
    }
}

/**
 * The job class
 */
class Job {
    /**
     * Should be private
     */
    constructor(title, run, isDone, faith, patience) {
        /** @type {string} Description of the job. Optional. */
        this.title = title;

        /** @type {Job} Provides previous job : that needs be done before */
        this._previous = null;

        /** @type {() => Promise<void>} Definition of the job : will be called once each time 
         * this job is attempted. */
        this.run = run;

        /** @type {() => Promise<boolean>} Resolves to true if job is considered done, 
         * false otherwise */
        this.isDone = isDone;

        /** @type {number} The number of millis to wait after this.run() resolved for this.isDone() 
         * to resolve to true. 
         * 
         * If no calls to this.isDone() resolved to true within that number of millis, then the job
         * is considered 'failed' */
        this.faith = faith;

        /** @type {number} The number of millis to wait between calls to this.isDone().
         * 
         * After this.run() resolved, this.isDone() will be called repeatedly to see
         * if the job can be considered done. This is the number of millis between two such calls.
         * (Between end of last call (resolve or reject) and start of next.) */
        this.patience = patience;

        /** @type {Job} Provides next job : to be done next */
        this._next = null;
    }

    static builder() {
        return new JobBuilder();
    }

    /**
     * Only two options for resolving : true in case isDone() resolved to true, 
     * or false in case timed out (after this.faith ms)
     * 
     * Does try repeatedly : calls isDone(), when resolves waits this.patience and retries, etc.
     * until isDone resolves to true or timeout.
     * @returns {Promise<boolean>}
     */
    async _isDone() {
        return new Promise(async(resolve) => {
            //#region definitions and initialization
            /** @type {boolean} true while this promise not yet resolved */
            let stillRunning = true;
            /** @type {number} number of completed calls to this.isDone() */
            let isDoneCalls = 0;
            /** @type {number} timeout id (for cancelling if success) */
            let sid;
            //possible outcomes : timeout or success
            /** @type {() => void} if stillRunning, logs, set stillRunning to false and 
             * resolves false */
            let timeOutResolve = () => {
                if (stillRunning) {
                    logger.debug("job._isDone() timing out. Probably job.run() was not successful.",
                        JSON.stringify({
                            title: this.title,
                            timeout: this.faith,
                            run: this.run,
                            isDone: this.isDone,
                            isDoneCalls
                        }));
                    stillRunning = false;
                    resolve(false);
                }
            };
            /** @type {() => void} if stillRunning, logs, clearTimeout(sid), set stillRunning
             * to false and resolves true*/
            let successResolve = () => {
                if (stillRunning) {
                    logger.debug("job._isDone() resolving true : job well done.",
                        JSON.stringify({
                            title: this.title,
                            isDoneCalls
                        }));
                    clearTimeout(sid);
                    stillRunning = false;
                    resolve(true);
                }
            };
            /** @type {() => void} if stillRunning, logs something*/
            let loggingIsDoneReturnedFalse = () => {
                if (stillRunning) {
                    logger.debug("job._isDone() : last call to isDone() returned false. Going on.",
                        JSON.stringify({
                            title: this.title,
                            isDoneCalls,
                            isDone: this.isDone
                        }));
                }
            };
            /** @type {() => void} if stillRunning, logs something*/
            let loggingIsDoneRejected = () => {
                if (stillRunning) {
                    logger.debug("job._isDone() : last call to isDone() rejected. Going on.",
                        JSON.stringify({
                            title: this.title,
                            isDoneCalls,
                            isDone: this.isDone
                        }));
                }
            };
            //#endregion

            //OK - everything is in place

            //scheduling time out - job failed - outcome
            sid = setTimeout(timeOutResolve, this.faith);

            //while not timed out, trying isDone
            while (stillRunning) {
                await this.isDone()
                    .then(v => {
                        isDoneCalls++;
                        if (v) {
                            successResolve();
                        } else {
                            loggingIsDoneReturnedFalse();
                        }
                    }, () => {
                        isDoneCalls++;
                        loggingIsDoneRejected();
                    });
                //let 's wait before retrying isDone
                await new Promise(res => setTimeout(res, this.patience));
            }

            //if at some point successResolve is called -> then stillrunning = false : 
            //loop stops and the timeout is canceled
            //else it runs until timeout where stillrunning is set to false, the current loop
            //might be going on but all functions are rendered useless anyway and then loop is done
        });
    }
}

class SerialWorker {

    //TODO add skippable option ?
    constructor() {
        /** @type {Job[]} The jobs that need be done */
        this._jobs = [];
    }

    /**
     * 
     * Implementation detail : the job passed shouldn't be mutated.
     * 
     * @param {Job} job 
     */
    addJob(job) {
        //add to jobs
        let newLength = this._jobs.push(
            new Job(
                job.title,
                job.run,
                job.isDone,
                job.faith,
                job.patience)
        );
        //connexion with previous last job (if there was one at all)
        if (newLength > 1) {
            this._jobs[newLength - 1]._previous = this._jobs[newLength - 2];
            this._jobs[newLength - 2]._next = this._jobs[newLength - 1];
        }
    }

    /**
     * @returns {Promise<number>} the number of any job done or -1 if none done yet.
     */
    _status() {
        return new Promise((resolve) => {
            let response = this._jobs.map(j => null);
            let running = true;

            let evaluateStatus = () => {
                if (running) {
                    let indexOfTrue = response.lastIndexOf(true);
                    if (indexOfTrue > -1) {
                        running = false;
                        logger.debug("serialWorker._status : returning :", indexOfTrue);
                        resolve(indexOfTrue);
                    } else if (response.every(r => r === false)) {
                        running = false;
                        logger.debug("serialWorker._status : returning :", -1);
                        resolve(-1);
                    }
                }
            };

            for (let index = this._jobs.length - 1; index > -1; index--) {
                this._jobs[index].isDone().then((v) => {
                    response[index] = v;
                    evaluateStatus();
                }, () => {
                    response[index] = false;
                    evaluateStatus();
                });
            }
        });
    }

    /**
     * (also resolves to true if no jobs at all...)
     * @param {number} attemptsLeft 
     * @returns {Promise<boolean>} Resolves with true if successful, false otherwise
     */
    async work(attemptsLeft) {

        if (this._jobs.length === 0) {
            logger.debug("serialWorker.work : no jobs found. Aborting and returning true.")
            return true;
        }

        let status = await this._status();

        while (status < this._jobs.length - 1) {
            let currentJob = this._jobs[status + 1];

            logger.debug("serialWorker.work : running job",
                JSON.stringify({ job: currentJob.title }));
            await currentJob.run();

            if (await currentJob._isDone()) {
                logger.debug("serialWorker.work : run succesful, Moving on to next one.");
                status++;
            } else {
                logger.debug("serialWorker.work : run failed.",
                    JSON.stringify({ job: currentJob.title }));

                attemptsLeft--;

                if (attemptsLeft > 0) {
                    logger.debug("serialWorker.work : retrying.",
                        JSON.stringify({ attemptsLeft }));
                    status = await this._status();
                } else {
                    logger.debug("serialWorker.work : no more attempts left, returning false");
                    return false;
                }
            }
        }
        logger.debug("serialWorker.work : objective reached. Returning true");
        return true;
    }
}

module.exports = { Job, SerialWorker }