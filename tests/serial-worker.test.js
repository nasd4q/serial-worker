const { SerialWorker, Job } = require("../serial-worker");

const loglevel = require("loglevel");
loglevel.getLogger("serial-worker").setLevel(loglevel.levels.DEBUG);


describe("SerialWorker", () => {
    test("Add one simple but uncertain job and attempt it", async(done) => {


        for (var i = 0; i < 30; i++) {

            await new Promise(res => setTimeout(res, 500));
            console.log("   *   *   *   New test    *   *   *")
            await new Promise(res => setTimeout(res, 500));

            //Set up
            let value = 0;
            if (Math.random() > 0.9) {
                console.log('Job already done case');
                value++;
            }
            let worker = new SerialWorker();

            let runCount = 0;
            let isDoneCount = 0;

            let journal = "";

            //no jobs yet right ?
            expect(worker._jobs.length).toBe(0);


            let simpleJob = Job.builder()
                .setTitle("Basic : value setter")
                .withTask(async() => {
                    runCount++;
                    journal += ' ** RUN **... ';
                    if (Math.random() > 0.5) {
                        journal += 'doing it // ';

                        value = 1;
                        return;
                    } else {
                        journal += 'failing it // ';
                        return;
                    }

                })
                .withTarget(async() => {
                    journal += 'checking... ';

                    await new Promise(res => setTimeout(res, 100));

                    isDoneCount++;
                    if (value === 1) {
                        journal += 'OK // ';

                        return true;
                    }
                    journal += 'no, not yet // ';
                    return false;
                })
                .setFaith(1000)
                .setPatience(400)
                .build()

            worker.addJob(simpleJob);

            //one job now right ?
            expect(worker._jobs.length).toBe(1);
            expect(worker._jobs[0].title).toBe("Basic : value setter");


            //Test
            let success = await worker.work(2);
            if (success) {
                expect(value).toBe(1);
                console.log("Success case : \n" + "runCount : " + runCount + ", isDoneCount : " + isDoneCount + " /// " + journal);
            } else {
                expect(value).toBe(0);
                console.log("Failure case : \n" + "runCount : " + runCount + ", isDoneCount : " + isDoneCount + " /// " + journal);
            }
        }
        done();
    }, 15 * 60 * 1000);
});