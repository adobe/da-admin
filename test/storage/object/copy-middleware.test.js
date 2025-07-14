import {expect, it, describe, beforeAll, vi, afterEach} from "vitest";
import { getAclCtx } from "../../../src/utils/auth.js";

// This test file uses a different mocking mechanism for the S3Client, as we want to test the internal
// middleware property of the S3Client. This is not accessible through the usual mock.
// Modules must be imported dynamically for the vi.doMock function to work.
// Do NOT import modules that contain the S3Client at top level here!

describe('Middleware', () => {
  beforeAll(() => {
    vi.mock('../../../src/storage/object/get.js', () => {
      const actual = vi.importActual('../../../src/storage/object/get.js');
      return {
        default: vi.fn(actual.default)
      };
    });
    vi.mock('../../../src/storage/version/put.js', () => {
      const actual = vi.importActual('../../../src/storage/version/put.js');
      return {
        putObjectWithVersion: vi.fn(actual.putObjectWithVersion)
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });


  it('Adds copy condition', async () => {
    const msAdded = [];
    const mockS3Client = class {
      send(command) {
        return command;
      }
      middlewareStack = {
        add: (a, b) => {
          msAdded.push(a);
          msAdded.push(b);
        },
      };
    };

    vi.doMock('@aws-sdk/client-s3', async () => {
      const actual = await vi.importActual('@aws-sdk/client-s3');
      return {
        ...actual,
        S3Client: mockS3Client
      }
    });

    const { copyFile } = await import("../../../src/storage/object/copy.js");

    const collabCalled = [];
    const env = {
      dacollab: {
        fetch: (x) => { collabCalled.push(x); },
      },
    };
    const daCtx = {
      org: 'myorg',
      origin: 'https://blahblah:7890',
      users: [{email: 'joe@bloggs.org', otherstuff: 'blah'}],
    };
    daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
    const details = {
      source: 'mysrc',
      destination: 'mydst',
    };
    const resp = await copyFile({}, env, daCtx, 'mysrc/abc/def.html', details, false);

    expect(resp.constructor.name).to.eq('CopyObjectCommand');
    expect(resp.input.Bucket).to.eq('myorg-content');
    expect(resp.input.Key).to.eq('mydst/abc/def.html');
    expect(resp.input.CopySource).to.eq('myorg-content/mysrc/abc/def.html');
    expect(resp.input.MetadataDirective).to.eq('REPLACE');
    expect(resp.input.Metadata.Path).to.eq('mydst/abc/def.html');
    expect(resp.input.Metadata.Users).to.eq('[{"email":"joe@bloggs.org"}]');
    const mdts = Number(resp.input.Metadata.Timestamp);
    expect(mdts + 1000).to.be.greaterThan(Date.now());

    expect(msAdded.length).to.eq(2);
    const amd = msAdded[1];
    expect(amd.step).to.eq('build');
    expect(amd.name).to.eq('ifNoneMatchMiddleware');
    expect(amd.tags).to.deep.eq(['METADATA', 'IF-NONE-MATCH']);
    const func = msAdded[0];

    const nxtCalled = [];
    const nxt = (args) => {
      nxtCalled.push(args);
      return 'yay!';
    };
    const res = await func((nxt));

    const args = { request: { foo: 'bar', headers: { aaa: 'bbb' } } };
    const res2 = await res(args);
    expect(res2).to.eq('yay!');

    expect(nxtCalled.length).to.eq(1);
    expect(nxtCalled[0].request.foo).to.eq('bar');
    expect(nxtCalled[0].request.headers).to.deep.eq(
      { aaa: 'bbb', 'cf-copy-destination-if-none-match': '*' });

    expect(collabCalled).to.deep.eq(
      ['https://localhost/api/v1/syncAdmin?doc=https://blahblah:7890/source/myorg/mydst/abc/def.html']);
  });
});
