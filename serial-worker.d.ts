/**
 * The job class
 */
export class Job {
    static builder(): JobBuilder;
    /**
     * Should be private
     */
    constructor(title: any, run: any, isDone: any, faith: any, patience: any);
    /** @type {string} Description of the job. Optional. */
    title: string;
    /** @type {Job} Provides previous job : that needs be done before */
    _previous: Job;
    /** @type {() => Promise<void>} Definition of the job : will be called once each time
     * this job is attempted. */
    run: () => Promise<void>;
    /** @type {() => Promise<boolean>} Resolves to true if job is considered done,
     * false otherwise */
    isDone: () => Promise<boolean>;
    /** @type {number} The number of millis to wait after this.run() resolved for this.isDone()
     * to resolve to true.
     *
     * If no calls to this.isDone() resolved to true within that number of millis, then the job
     * is considered 'failed' */
    faith: number;
    /** @type {number} The number of millis to wait between calls to this.isDone().
     *
     * After this.run() resolved, this.isDone() will be called repeatedly to see
     * if the job can be considered done. This is the number of millis between two such calls.
     * (Between end of last call (resolve or reject) and start of next.) */
    patience: number;
    /** @type {Job} Provides next job : to be done next */
    _next: Job;
    /**
     * Only two options for resolving : true in case isDone() resolved to true,
     * or false in case timed out (after this.faith ms)
     *
     * Does try repeatedly : calls isDone(), when resolves waits this.patience and retries, etc.
     * until isDone resolves to true or timeout.
     * @returns {Promise<boolean>}
     */
    _isDone(): Promise<boolean>;
}
export class SerialWorker {
    /** @type {Job[]} The jobs that need be done */
    _jobs: Job[];
    /**
     *
     * Implementation detail : the job passed shouldn't be mutated.
     *
     * @param {Job} job
     */
    addJob(job: Job): void;
    /**
     * @returns {Promise<number>} the number of any job done or -1 if none done yet.
     */
    _status(): Promise<number>;
    /**
     * (also resolves to true if no jobs at all...)
     * @param {number} attemptsLeft
     * @returns {Promise<boolean>} Resolves with true if successful, false otherwise
     */
    work(attemptsLeft: number): Promise<boolean>;
}
declare class JobBuilder {
    static FAITH_DEFAULT: number;
    static PATIENCE_DEFAULT: number;
    /**
     * @param {string} title Description of the job. Optional.
     */
    setTitle(title: string): JobBuilder;
    _title: string;
    /**
     * @param {() => Promise<void>} run A function that will be called once each time
     * this job is attempted. Must return a promise which resolves when tasks are done.
     */
    withTask(run: () => Promise<void>): JobBuilder;
    _run: () => Promise<void>;
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
    withTarget(isDone: () => Promise<boolean>): JobBuilder;
    _isDone: () => Promise<boolean>;
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
    setFaith(faith: number): JobBuilder;
    _faith: number;
    /**
     * @param {number} patience Number of milliseconds to wait after a call to `Job.isDone()`
     * has resolved to false (or failed), before trying again and calling another time `isDone()`
     *
     * Defaults to 400 (ms).
     *
     * When checking if job is indeed done after `Job.run()` has resolved, `Job.isDone()` gets
     * called repeatedly. `patience` provides a delay between two such calls.
     */
    setPatience(patience: number): JobBuilder;
    _patience: number;
    build(): Job;
}
export {};
