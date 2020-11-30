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
            let value1 = 0;
            if (Math.random() > 0.6) {
                console.log('Job 1 already done case');
                value1 = 1;
            }
            let value2 = 0;
            if (Math.random() > 0.6) {
                console.log('Job 2 already done case');
                value2 = 1;
            }
            let worker = new SerialWorker();

            let runCount1 = 0;
            let isDoneCount1 = 0;
            let runCount2 = 0;
            let isDoneCount2 = 0;

            let journal = "";

            //no jobs yet right ?
            expect(worker._jobs.length).toBe(0);


            let job1 = Job.builder()
                .setTitle("Job 1")
                .withTask(async() => {
                    runCount1++;
                    journal += ' ** RUN 1 **... ';
                    if (Math.random() > 0.5) {
                        journal += '1 - doing it // ';

                        value1 = 1;
                        return;
                    } else {
                        journal += '1 - failing it // ';
                        return;
                    }

                })
                .withTarget(async() => {
                    journal += 'checking 1... ';

                    await new Promise(res => setTimeout(res, 100 + Math.floor(Math.random() * 150)));

                    isDoneCount1++;
                    if (value1 === 1) {
                        journal += '1 - OK // ';

                        return true;
                    }
                    journal += '1 - no, not yet // ';
                    return false;
                })
                .setFaith(1000)
                .setPatience(400)
                .build()

            let job2 = Job.builder()
                .setTitle("Job 2")
                .withTask(async() => {
                    runCount2++;
                    journal += ' ** RUN 2 **... ';
                    if (Math.random() > 0.5) {
                        journal += '2 - doing it // ';

                        value2 = 1;
                        return;
                    } else {
                        journal += '2 - failing it // ';
                        return;
                    }

                })
                .withTarget(async() => {
                    journal += 'checking 2... ';
                    isDoneCount2++;

                    await new Promise(res => setTimeout(res, 100 + Math.floor(Math.random() * 150)));

                    if (value2 === 1) {
                        journal += '2 - OK // ';

                        return true;
                    }
                    journal += '2 - no, not yet // ';
                    return false;
                })
                .setFaith(1000)
                .setPatience(400)
                .build()

            worker.addJob(job1);

            worker.addJob(job2);

            //one job now right ?
            expect(worker._jobs.length).toBe(2);
            expect(worker._jobs[1].title).toBe("Job 2");


            //Test
            let success = await worker.work(5);
            if (success) {
                expect(value2).toBe(1);
                console.log("Success case : \n" + "runCount1 : " + runCount1 + ", isDoneCount1 : " + isDoneCount1);
                console.log("Success case : \n" + "runCount2 : " + runCount2 + ", isDoneCount2 : " + isDoneCount2);

            } else {
                console.log(value2);
                console.log("Failure case : \n" + "runCount1 : " + runCount1 + ", isDoneCount1 : " + isDoneCount1);
                console.log("Failure case : \n" + "runCount2 : " + runCount2 + ", isDoneCount2 : " + isDoneCount2);
            }
            console.log(journal);
        }
        done();
    }, 15 * 60 * 1000);
});