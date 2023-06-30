import { AllureGroup, AllureRuntime, AllureStep, AllureTest, LabelName } from 'allure-js-commons';
import AllureTaskArgs = Cypress.AllureTaskArgs;
import getUuid from 'uuid-by-string';
import { parseAllure } from 'allure-js-parser';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path, { basename } from 'path';
import glob from 'fast-glob';
import getUuidByString from 'uuid-by-string';

const log = (...args: unknown[]) => {
  console.log(`[allure-reporter] ${args}`);
};
enum ContentType {
  TEXT = 'text/plain',
  XML = 'application/xml',
  HTML = 'text/html',
  CSV = 'text/csv',
  TSV = 'text/tab-separated-values',
  CSS = 'text/css',
  URI = 'text/uri-list',
  SVG = 'image/svg+xml',
  PNG = 'image/png',
  JSON = 'application/json',
  ZIP = 'application/zip',
  WEBM = 'video/webm',
  JPEG = 'image/jpeg',
  MP4 = 'video/mp4',
}
enum Status {
  PASSED = 'passed',
  FAILED = 'failed',
  BROKEN = 'broken',
  SKIPPED = 'skipped',
}
const UNKNOWN = 'unknown' as Status;

enum Stage {
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  FINISHED = 'finished',
  PENDING = 'pending',
  INTERRUPTED = 'interrupted',
}
export class AllureReporter {
  // todo config
  groups: AllureGroup[] = [];
  tests: AllureTest[] = [];
  allTests: { specRelative: string | undefined; fullTitle: string; uuid: string; mochaId: string }[] = [];
  steps: AllureStep[] = [];
  currentSpec: Cypress.Spec | undefined;
  allureRuntime: AllureRuntime;
  descriptionHtml: string[] = [];
  attached: string[] = [];

  constructor(private allureResults: string = 'allure-results', private videos: string, private screenshots: string) {
    log('Created reporter');
    this.allureRuntime = new AllureRuntime({ resultsDir: this.allureResults });
  }

  get currentGroup() {
    if (this.groups.length === 0) {
      return undefined;
    }

    return this.groups[this.groups.length - 1];
  }

  get currentTest() {
    if (this.tests.length === 0) {
      // const item = this.currentGroup?.addBefore();
      //this.tests.push(item);

      // return item;
      throw new Error('No current test - start test');
    }

    return this.tests[this.tests.length - 1];
  }

  get currentStep() {
    if (this.steps.length === 0) {
      return undefined;
    }

    return this.steps[this.steps.length - 1];
  }

  startGroup(title: string) {
    if (this.groups.length === 0 && title === '') {
      return undefined;
    }
    const group = (this.currentGroup ?? this.allureRuntime).startGroup(title);
    this.groups.push(group);
    console.log(`SUITES: ${JSON.stringify(this.groups.map(t => t.name))}`);

    return group;
  }

  attachScreenshots(arg: AllureTaskArgs<'attachScreenshots'>) {
    const { screenshots } = arg;
    log('attachScreenshots:');

    screenshots?.forEach(x => {
      const screenshotContent = readFileSync(x.path);
      const guidScreenshot = getUuidByString(screenshotContent.toString());

      if (this.attached.filter(t => t.indexOf(guidScreenshot) !== -1).length > 0) {
        log(`Already attached: ${x.path}`);

        return;
      }

      log(`attachScreenshots:${x.path}`);
      const uuids = this.allTests.filter(t => t.mochaId == x.testId).map(t => t.uuid);

      uuids.forEach(uuid => {
        const testFile = `${this.allureResults}/${uuid}-result.json`;
        const contents = readFileSync(testFile);
        const ext = path.extname(x.path);
        const name = path.basename(x.path);
        const testCon = JSON.parse(contents.toString());
        const nameAttAhc = `${getUuid(x.path)}-attachment${ext}`; // todo not copy same video
        const newPath = path.join(this.allureResults, nameAttAhc);

        if (!existsSync(newPath)) {
          copyFileSync(x.path, path.join(this.allureResults, nameAttAhc));
        }

        if (testCon.attachments) {
          testCon.attachments.push({
            name: name,
            type: ContentType.PNG,
            source: nameAttAhc, // todo
          });
        } else {
          testCon.attachments = [
            {
              name: name,
              type: ContentType.PNG,
              source: nameAttAhc, // todo
            },
          ];
        }
        writeFileSync(testFile, JSON.stringify(testCon));
      });
    });
  }

  screenshotOne(arg: AllureTaskArgs<'screenshotOne'>) {
    const { name, forStep } = arg;

    const pattern = `${this.screenshots}/**/${name}*.png`;
    const files = glob.sync(pattern);

    if (files.length === 0) {
      log(`NO SCREENSHOTS: ${pattern}`);

      return null;
    }

    files.forEach(file => {
      console.log(file);
      const executable = this.currentStep ?? this.currentTest;
      const attachTo = forStep ? executable : this.currentTest;

      const fileCot = readFileSync(file);

      // to have it in allure-results directory
      const fileNew = `${getUuidByString(fileCot.toString())}-attachment.png`;

      if (!existsSync(this.allureResults)) {
        mkdirSync(this.allureResults);
      }

      if (!existsSync(file)) {
        console.log(`file ${file} doesnt exist`);

        return null;
      }
      copyFileSync(file, `${this.allureResults}/${fileNew}`);

      /*const pathDir = allureReporter.allureRuntime.writeAttachment(fileCot, {
      fileExtension: 'png',
      contentType: 'image/png',
    });*/
      attachTo?.addAttachment(basename(file), { contentType: 'image/png', fileExtension: 'png' }, fileNew);
      this.attached.push(fileNew);
    });
  }

  attachVideoToTests(videoPath: string) {
    log(`attachVideoToTests: ${videoPath}`);
    const specname = basename(videoPath, '.mp4');
    log(specname);
    const res = parseAllure(this.allureResults);
    const tests = res.map(t => ({ path: t.labels.find(l => l.name === 'path')?.value, id: t.uuid }));
    const testsAttach = tests.filter(t => t.path && t.path.indexOf(specname) !== -1);
    log(JSON.stringify(testsAttach));
    testsAttach.forEach(t => {
      const testFile = `${this.allureResults}/${t.id}-result.json`;
      const contents = readFileSync(testFile);
      const testCon = JSON.parse(contents.toString());
      const nameAttAhc = `${getUuid(videoPath)}-attachment.mp4`; // todo not copy same video
      const newPath = path.join(this.allureResults, nameAttAhc);

      if (!existsSync(newPath)) {
        copyFileSync(videoPath, path.join(this.allureResults, nameAttAhc));
      }

      if (testCon.attachments) {
        testCon.attachments.push({
          name: specname,
          type: ContentType.MP4,
          source: nameAttAhc, // todo
        });
      } else {
        testCon.attachments = [
          {
            name: specname,
            type: ContentType.MP4,
            source: nameAttAhc, // todo
          },
        ];
      }
      writeFileSync(testFile, JSON.stringify(testCon));
      //testCon.attachments = []

      // "attachments":[{"name":"suite with one test -- #1 test fail (failed).png","type":"image/png","source":"b593b23f-0fe2-4782-acca-ddb5d812e4dd-attachment.png"}]
      //
    });
  }

  endGroup() {
    if (this.currentGroup) {
      this.currentGroup?.endGroup();
      this.groups.pop();
    }
  }

  endAllGroups() {
    this.groups.forEach(g => {
      g.endGroup();
    });
    this.attached = [];
  }

  setLabel(arg: AllureTaskArgs<'setLabel'>) {
    this.currentTest.addLabel(arg.name, arg.value);
  }

  applyGroupLabels() {
    this.currentTest.addLabel(LabelName.PACKAGE, this.groups.map(t => t.name.replace(/\./g, ' ')).join('.'));
    const [parentSuite, suite, subSuite] = this.groups;

    if (this.groups.length > 0) {
      this.currentTest.addLabel(LabelName.PARENT_SUITE, parentSuite.name);
    }

    if (this.groups.length > 1) {
      this.currentTest.addLabel(LabelName.SUITE, suite.name);
    }

    if (this.groups.length > 2) {
      this.currentTest.addLabel(LabelName.SUB_SUITE, subSuite.name);
    }
  }

  startTest(arg: AllureTaskArgs<'testStarted'>) {
    const { title, fullTitle, id } = arg;
    let autoTitle = title;
    const duplicates = this.allTests.filter(t => t.fullTitle === fullTitle);

    const warn =
      'STARTING TEST WITH THE SAME fullName as already, will be shown as' +
      `retried: ${fullTitle}\nTo solve this rename the test. Spec ${this.currentSpec?.relative}`;

    if (duplicates.length > 0) {
      console.warn(warn);
      autoTitle += ` ${Date.now()}`;
    }

    const group = this.currentGroup ?? this.startGroup('Root suite');
    const test = group!.startTest(title);

    this.allTests.push({ specRelative: this.currentSpec?.relative, fullTitle, mochaId: id, uuid: test.uuid }); // to show warning
    this.tests.push(test);
    this.currentTest.fullName = fullTitle;

    if (title !== autoTitle) {
      this.addDescriptionHtml(
        '<div style="color: #a4951f;">Warn: Test with the same full name already exist (suites + title). Test is shown as retried</br>To solve rename the test</div>',
      );
    }
    this.currentTest.historyId = getUuid(fullTitle);
    this.applyGroupLabels();

    if (this.currentSpec?.relative) {
      this.currentTest.addLabel('path', this.currentSpec.relative);
      this.addDescriptionHtml(this.currentSpec.relative);
    }
  }

  endTests() {
    this.tests.forEach(() => {
      this.endTest({ result: 'unknown', details: undefined });
    });
  }

  endGroups() {
    this.endTests();
    this.groups.forEach(() => {
      this.endGroup();
    });
  }

  endAll() {
    this.endAllSteps({ status: 'unknown', details: undefined });

    this.endGroups();
  }

  addDescriptionHtml(descriptionHtml: string) {
    this.descriptionHtml.push(descriptionHtml);
    this.applyDescriptionHtml();
    // this.currentTest.descriptionHtml = (this.currentTest.descriptionHtml ?? '') + descriptionHtml;
    //this.currentTest.des
  }

  applyDescriptionHtml() {
    this.currentTest.descriptionHtml = this.descriptionHtml.join('</br>');
  }

  endTest(arg: AllureTaskArgs<'testEnded'>) {
    const { result, details } = arg;
    this.endAllSteps({ status: result, details });
    // this.currentTest.status = result as Status; //todo

    // this.endSteps();

    if (result === Status.PASSED) {
      this.currentTest.status = Status.PASSED;
      this.currentTest.stage = Stage.FINISHED;
    }

    if (result === Status.BROKEN) {
      this.currentTest.status = Status.BROKEN;
      this.currentTest.stage = Stage.FINISHED;
    }

    if (result === Status.FAILED) {
      this.currentTest.status = Status.FAILED;
      this.currentTest.stage = Stage.FINISHED;

      this.currentTest.detailsMessage = details?.message;
      this.currentTest.detailsTrace = details?.trace;
    }

    if (result === Status.SKIPPED) {
      this.currentTest.status = Status.SKIPPED;
      this.currentTest.stage = Stage.PENDING;

      this.currentTest.detailsMessage = details?.message || 'Suite disabled';
    }

    if (result !== Status.FAILED && result !== Status.BROKEN && result !== Status.PASSED && result !== Status.SKIPPED) {
      this.currentTest.status = UNKNOWN;
      this.currentTest.stage = Stage.PENDING;

      this.currentTest.detailsMessage = details?.message || `Unknown result: ${result ?? '<no>'}`;
    }

    if (details) {
      this.currentTest.statusDetails = details;
    }

    /*this.featureProps.apply(a => super.feature(a));
    this.storyProps.apply(a => super.story(a));
    this.frameworkProps.apply(a => super.label(LabelName.FRAMEWORK, a));
    this.languageProps.apply(a => super.label(LabelName.LANGUAGE, a));
    this.hostProps.apply(a => super.label(LabelName.HOST, a));

    this.applyDescription();

    if (this.config?.autoHistoryId !== false) {
      this.setHistoryId(spec.fullName);
    }
    this.currentTest.endTest(stop || dateNow());*/

    this.currentTest.endTest();
    this.tests.pop();
    this.descriptionHtml = [];
  }

  startStep(arg: AllureTaskArgs<'stepStarted'>) {
    const { name, date } = arg;
    const executable = this.currentStep ?? this.currentTest;

    const step = executable.startStep(name, date);
    // step.description = 'sddsds ';
    // step.detailsMessage = 'sas asdetails ';
    this.steps.push(step);
  }

  endAllSteps(arg: AllureTaskArgs<'stepEnded'>) {
    this.steps.forEach(() => {
      this.endStep(arg);
    });
  }

  endStep(arg: AllureTaskArgs<'stepEnded'>) {
    const { status, date } = arg;

    if (this.currentStep) {
      this.currentStep.status = status as Status;

      if (arg.details) {
        this.currentStep.statusDetails = { message: arg.details?.message };
      }
      this.currentStep.endStep(date);

      this.steps.pop();
    }
  }
}
