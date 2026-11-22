/*!
 * StackStrip engine — Debug the failure, not the company's internals.
 * Pure JS, no dependencies, runs in the browser and in Node.
 * Apache-2.0
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StackStrip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Defaults
  // ---------------------------------------------------------------------------

  const DEFAULTS = {
    contextLines: 4,          // log lines kept right before each stack trace
    maxWarnings: 5,           // most recent distinct WARN lines kept before the first stack trace
    maxPublicRun: 6,          // longer runs of framework frames get collapsed
    keepPublicHead: 4,        // ...keeping this many of them
    hidePrivateSource: true,  // drop source-code lines printed under private frames
    aliasStrings: true,       // 'quoted values' in messages become 'str1'
    privatePrefixes: [],      // always private, e.g. ["com.acme", "acme_"]
    publicPrefixes: [],       // always public, on top of the built-in list
    privateTerms: [],         // words to always hide, e.g. ["Acme", "Globex"]
    privateDomains: [],       // e.g. ["acme.com"] — hosts on these become aliases
    hideIdentity: true,       // usernames, machine names, home folders, git author names
    noCut: true,              // default: never drop lines, only hide. false = trim long logs to the failure
    keepVisible: [],          // never hide these: exact names, or library prefixes like "org.bouncycastle."
  };

  // Public (framework / language / library) package prefixes.
  const PUBLIC_PREFIXES = [
    // JVM
    'java.', 'javax.', 'jakarta.', 'jdk.', 'sun.', 'com.sun.', 'kotlin.', 'kotlinx.', 'scala.', 'groovy.',
    'org.springframework.', 'org.apache.', 'org.hibernate.', 'org.eclipse.', 'org.glassfish.', 'org.jboss.',
    'org.junit.', 'org.mockito.', 'org.slf4j.', 'ch.qos.logback.', 'org.postgresql.', 'org.h2.', 'org.flywaydb.',
    'org.liquibase.', 'liquibase.', 'org.aspectj.', 'org.quartz.', 'org.yaml.', 'org.json.', 'org.bson.',
    'com.fasterxml.', 'com.google.', 'com.zaxxer.', 'com.mysql.', 'com.mongodb.', 'com.amazonaws.',
    'software.amazon.', 'com.azure.', 'com.microsoft.', 'io.netty.', 'io.grpc.', 'io.micronaut.', 'io.quarkus.',
    'io.vertx.', 'io.reactivex.', 'io.github.resilience4j.', 'io.micrometer.', 'io.opentelemetry.',
    'io.lettuce.', 'redis.clients.', 'reactor.', 'okhttp3.', 'okio.', 'retrofit2.', 'feign.', 'lombok.',
    'net.bytebuddy.', 'org.testng.', 'org.gradle.', 'org.codehaus.', 'graphql.', 'akka.', 'play.',
    'android.', 'androidx.', 'dalvik.', 'com.android.', 'org.jetbrains.', 'org.elasticsearch.', 'co.elastic.',
    'org.apache.kafka.', 'org.thymeleaf.', 'freemarker.', 'jakarta.servlet.', 'javax.servlet.',
    'org.bouncycastle.', 'org.conscrypt.', 'org.jose4j.', 'com.nimbusds.', 'io.jsonwebtoken.', 'org.keycloak.', 'org.owasp.',
    'org.jasypt.', 'io.undertow.', 'org.xnio.', 'org.wildfly.', 'io.smallrye.', 'io.helidon.', 'io.dropwizard.', 'com.codahale.',
    'io.prometheus.', 'org.HdrHistogram.', 'io.kubernetes.', 'io.fabric8.', 'io.minio.', 'io.temporal.', 'io.projectreactor.',
    'org.reactivestreams.', 'io.reactivex.', 'rx.', 'com.typesafe.', 'org.joda.', 'org.threeten.', 'org.objectweb.asm.', 'org.ow2.',
    'org.mariadb.', 'oracle.jdbc.', 'com.oracle.', 'org.sqlite.', 'org.xerial.', 'org.neo4j.', 'org.infinispan.', 'org.ehcache.',
    'com.github.benmanes.caffeine.', 'com.esotericsoftware.', 'org.msgpack.', 'com.squareup.', 'org.jooq.', 'org.mybatis.',
    'com.querydsl.', 'org.flowable.', 'org.camunda.', 'org.zeroturnaround.', 'org.assertj.', 'org.hamcrest.', 'org.awaitility.',
    'org.testcontainers.', 'net.minidev.', 'com.jayway.', 'org.mapstruct.', 'org.modelmapper.', 'org.apache.logging.', 'org.xml.',
    'org.w3c.', 'org.ietf.', 'org.omg.', 'org.graalvm.', 'org.osgi.', 'io.ktor.', 'org.openjdk.', 'net.sf.', 'org.javers.',
    'org.redisson.', 'io.vavr.', 'org.immutables.', 'org.checkerframework.', 'org.mongodb.', 'com.datastax.', 'org.apache.cassandra.',
    'io.opentracing.', 'brave.', 'zipkin2.', 'io.zipkin.', 'org.springdoc.', 'io.swagger.', 'org.openapitools.', 'com.hazelcast.',
    'org.apache.zookeeper.', 'org.apache.curator.', 'io.etcd.', 'org.rocksdb.', 'org.lz4.', 'org.xerial.snappy.', 'com.github.luben.',
    'org.tukaani.', 'org.brotli.', 'io.trino.', 'org.postgresql.', 'com.microsoft.sqlserver.', 'net.snowflake.', 'com.amazon.',
    // abbreviated logger names (logback %logger{20})
    'o.s.', 'o.a.', 'o.h.', 'i.n.', 'c.z.h.', 'c.f.j.', 'o.e.j.', 'r.c.',
    // .NET
    'System.', 'Microsoft.', 'Npgsql.', 'Newtonsoft.', 'Dapper.', 'Serilog.', 'NLog.', 'Polly.', 'MediatR.',
    'AutoMapper.', 'StackExchange.', 'Grpc.', 'Azure.', 'Amazon.', 'Xunit.', 'NUnit.', 'Moq.', 'FluentValidation.',
    // Python (dotted exception / module names)
    'requests.', 'urllib3.', 'urllib.', 'http.', 'sqlalchemy.', 'django.', 'flask.', 'werkzeug.', 'fastapi.',
    'starlette.', 'pydantic.', 'pydantic_core.', 'psycopg2.', 'psycopg.', 'botocore.', 'boto3.', 'numpy.', 'pandas.',
    'httpx.', 'httpcore.', 'aiohttp.', 'celery.', 'redis.', 'kafka.', 'grpc.', 'google.', 'json.', 'asyncio.',
    'concurrent.', 'socket.', 'ssl.', 'os.', 'sys.', 'collections.', 'multiprocessing.', 'subprocess.', 'email.',
    'xml.', 'sqlite3.', 'pymongo.', 'jwt.', 'jinja2.', 'marshmallow.', 'uvicorn.', 'gunicorn.', 'alembic.',
    'openai.', 'anthropic.', 'torch.', 'tensorflow.', 'sklearn.', 'scipy.', 'yaml.', 'click.', 'typer.',
  ];

  // Exception / error names that are always public (language + popular libraries).
  const PUBLIC_ERRORS = new Set((
    'Error TypeError RangeError ReferenceError SyntaxError EvalError URIError AggregateError AbortError ' +
    'DOMException SystemError AssertionError InternalError ValueError KeyError IndexError AttributeError ' +
    'RuntimeError ImportError ModuleNotFoundError NameError ZeroDivisionError OSError IOError FileNotFoundError ' +
    'PermissionError TimeoutError ConnectionError NotImplementedError StopIteration StopAsyncIteration LookupError ' +
    'ArithmeticError UnicodeDecodeError UnicodeEncodeError UnicodeError JSONDecodeError RecursionError MemoryError ' +
    'OverflowError BrokenPipeError ConnectionRefusedError ConnectionResetError ConnectionAbortedError BlockingIOError ' +
    'ChildProcessError IsADirectoryError NotADirectoryError InterruptedError ProcessLookupError UnboundLocalError ' +
    'FloatingPointError BufferError EOFError GeneratorExit KeyboardInterrupt SystemExit Exception BaseException ' +
    'Warning DeprecationWarning UserWarning RuntimeWarning ExceptionGroup BaseExceptionGroup CancelledError ' +
    'InvalidStateError IncompleteReadError AxiosError ZodError FetchError PrismaClientKnownRequestError ' +
    'PrismaClientValidationError PrismaClientInitializationError MongoServerError MongoError ' +
    'SequelizeDatabaseError SequelizeValidationError QueryFailedError EntityNotFoundError ValidationError ' +
    'HttpException NotFoundException BadRequestException UnauthorizedException ForbiddenException ' +
    'InternalServerErrorException UnhandledPromiseRejection ResponseError'
  ).split(' '));

  // Well-known exception names that often appear without their package — never hidden.
  const COMMON_BARE_EXC = new Set((
    'NullPointerException IllegalArgumentException IllegalStateException IndexOutOfBoundsException ArrayIndexOutOfBoundsException ' +
    'StringIndexOutOfBoundsException ClassCastException NumberFormatException ArithmeticException UnsupportedOperationException ' +
    'ConcurrentModificationException NoSuchElementException NoSuchFieldException NoSuchMethodException ClassNotFoundException ' +
    'NoClassDefFoundError OutOfMemoryError StackOverflowError ExceptionInInitializerError InterruptedException ExecutionException ' +
    'TimeoutException CancellationException CompletionException RejectedExecutionException IOException UncheckedIOException ' +
    'FileNotFoundException EOFException SocketException SocketTimeoutException ConnectException UnknownHostException ' +
    'SSLException SSLHandshakeException CertificateException MalformedURLException URISyntaxException SQLException ' +
    'SQLTimeoutException DataIntegrityViolationException DuplicateKeyException EmptyResultDataAccessException ' +
    'DataAccessException TransactionException OptimisticLockException PersistenceException EntityNotFoundException ' +
    'ConstraintViolationException LazyInitializationException HibernateException JsonProcessingException ' +
    'JsonParseException JsonMappingException MismatchedInputException InvalidFormatException BeanCreationException ' +
    'NoSuchBeanDefinitionException UnsatisfiedDependencyException HttpClientErrorException HttpServerErrorException ' +
    'ResourceAccessException ResponseStatusException MethodArgumentNotValidException AccessDeniedException ' +
    'AuthenticationException BadCredentialsException SecurityException ReflectiveOperationException InvocationTargetException ' +
    'UndeclaredThrowableException RuntimeException Exception Throwable Error AssertionError AmazonS3Exception ' +
    'AmazonServiceException SdkClientException S3Exception AwsServiceException NoSuchKeyException NoSuchBucketException ' +
    'ArgumentException ArgumentNullException ArgumentOutOfRangeException InvalidOperationException NullReferenceException ' +
    'KeyNotFoundException FormatException OverflowException DivideByZeroException ObjectDisposedException ' +
    'TaskCanceledException OperationCanceledException HttpRequestException DbUpdateException NotImplementedException ' +
    'NotSupportedException UnauthorizedAccessException InvalidCastException AggregateException FileLoadException ' +
    'DirectoryNotFoundException PathTooLongException SocketTimeoutError ConnectionError ReadTimeoutError HTTPError ' +
    'ConnectionRefusedError IntegrityError OperationalError ProgrammingError DatabaseError ValidationError ClientError ' +
    'BotoCoreError NoCredentialsError ParamValidationError EndpointConnectionError'
  ).split(' '));

  // Generic method / function names that reveal nothing and help the AI — never aliased.
  const GENERIC_NAMES = new Set((
    'main run call apply accept get set invoke execute handle process init close start stop toString equals ' +
    'hashCode compareTo doFilter doFilterInternal doGet doPost doPut doDelete service onMessage onNext onError ' +
    'onComplete test setUp tearDown constructor then catch finally next default anonymous <anonymous> <init> ' +
    '<clinit> <module> <lambda> <listcomp> <dictcomp> <setcomp> <genexpr> __init__ __call__ __enter__ __exit__ ' +
    '__aenter__ __aexit__ __getattr__ __getitem__ __iter__ __next__ wrapper inner decorator wrapped handler ' +
    'callback resolve reject emit listener lambda Object Array Promise Function Module process async new ' +
    'Generator Map Set String Number JSON Reflect Proxy Timeout Immediate EventEmitter Socket Server Layer ' +
    'Router module exports require Main Program MoveNext Invoke Run Execute Handle Start Dispose ' +
    'SpringCGLIB EnhancerBySpringCGLIB FastClassBySpringCGLIB HibernateProxy MockitoMock ByteBuddy'
  ).split(' '));

  const PUBLIC_HOSTS = [
    'localhost', 'github.com', 'githubusercontent.com', 'gitlab.com', 'npmjs.com', 'npmjs.org', 'pypi.org',
    'python.org', 'stackoverflow.com', 'mozilla.org', 'nodejs.org', 'spring.io', 'oracle.com', 'apache.org',
    'microsoft.com', 'learn.microsoft.com', 'example.com', 'example.org', 'w3.org', 'schema.org', 'json-schema.org',
    'maven.org', 'jetbrains.com', 'docker.com', 'docker.io', 'kubernetes.io', 'reactjs.org', 'react.dev',
    'nextjs.org', 'vercel.com', 'fb.me', 'webpack.js.org', 'typescriptlang.org', 'pydantic.dev', 'sqlalche.me',
    'errors.pydantic.dev', 'readthedocs.io', 'anthropic.com', 'openai.com',
  ];

  const COMMON_TLD = /^(?:com|net|org|io|dev|app|ai|co|cloud|tech|info|biz|xyz|in|uk|us|de|fr|nl|jp|cn|au|ca|eu|me|sh|so|gg|tv|ly|site|online|systems|solutions|services|global|group|corp|local|internal|lan|intra)$/;
  const INTERNAL_TLD = /\.(?:internal|local|corp|lan|intra|intranet|private|svc|cluster\.local|consul|home|priv)$/i;

  // ---------------------------------------------------------------------------
  // Alias table (serialisable — kept in chrome.storage so aliases stay stable)
  // ---------------------------------------------------------------------------

  function createAliasTable() {
    return { v: 1, forward: {}, kinds: {}, counters: {} };
  }

  const TEMPLATES = {
    pkg: (n) => 'app.mod' + n,
    cls: (n) => 'Class' + n,
    method: (n) => 'method' + n,
    exc: (n) => 'AppError' + n,
    pyfile: (n, ext) => 'app/module' + n + (ext || '.py'),
    jsfile: (n, ext) => 'app/file' + n + (ext || '.js'),
    csfile: (n, ext) => 'App/File' + n + (ext || '.cs'),
    func: (n) => 'func' + n,
    str: (n) => 'str' + n,
    host: (n) => 'host' + n + '.example.internal',
    email: (n) => 'mail' + n + '@example.com',
    ip: (n) => n <= 254 ? '192.0.2.' + n : '198.51.100.' + ((n - 254) % 254 || 1),
    uuid: (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
    term: (n) => 'Term' + n,
    ns: (n) => 'App.Ns' + n,
    path: (n, ext) => '/app/path' + n + (ext || ''),
    domain: (n) => 'domain' + n + '.example',
    bucket: (n) => 'bucket' + n,
    service: (n) => 'service' + n,
    word: (n) => 'org' + n,
    user: (n) => 'user' + n,
    machine: (n) => 'machine' + n,
    dir: (n) => 'project' + n,
    person: (n) => 'Person' + n,
    branch: (n) => 'branch' + n,
    srcfile: (n, ext) => 'src/file' + n + (ext || ''),
    id: (n) => 'ID-' + n,
  };

  let KEEP = null; // set per strip() call from opts.keepVisible
  function isKept(original) {
    if (!KEEP || !KEEP.size) return false;
    if (KEEP.has(original)) return true;
    for (const k of KEEP) if (/[.\/]$/.test(k) && (original + '.').startsWith(k)) return true;
    return false;
  }

  function aliasFor(table, kind, original, ext) {
    if (isKept(original)) return original;
    const key = kind + '\u0000' + original;
    if (table.forward[key]) return table.forward[key];
    const n = (table.counters[kind] || 0) + 1;
    table.counters[kind] = n;
    const alias = TEMPLATES[kind](n, ext);
    table.forward[key] = alias;
    table.kinds[alias] = kind;
    return alias;
  }

  function aliasCount(table) {
    return Object.keys(table.forward).length;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const TS_RE = /^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]?\s*|^\s*\[?\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]?\s*/;
  const normLog = (s) => String(s).replace(TS_RE, '');
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const estTokens = (s) => Math.ceil(s.length / 4);

  function startsWithAny(s, list) {
    for (const p of list) if (p && s.startsWith(p)) return true;
    return false;
  }

  function makeCtx(opts, table) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const priv = (o.privatePrefixes || []).map((s) => s.trim()).filter(Boolean);
    const pub = PUBLIC_PREFIXES.concat((o.publicPrefixes || []).concat((o.keepVisible || []).filter((k) => /\.$/.test(k))).map((s) => s.trim()).filter(Boolean));
    return {
      o, table,
      stats: { privateFrames: 0, publicFrames: 0, collapsedFrames: 0, secrets: 0, sourceHidden: 0, newAliases: 0 },
      secretsFound: [],
      isPublicName(name) {
        if (startsWithAny(name, priv)) return false;
        return startsWithAny(name, pub) || startsWithAny(name + '.', pub);
      },
      isForcedPrivate(s) {
        return startsWithAny(s, priv) || priv.some((p) => s.includes(p.replace(/\.$/, '')));
      },
      privateDomains: (o.privateDomains || []).map((d) => d.trim().toLowerCase()).filter(Boolean),
      privateTerms: (o.privateTerms || []).map((t) => t.trim()).filter((t) => t.length >= 2),
    };
  }

  // ---------------------------------------------------------------------------
  // Identity — usernames, machine names, project folders (terminal copies)
  // ---------------------------------------------------------------------------

  const GENERIC_USERS = new Set('root admin administrator user users ubuntu debian centos ec2-user azureuser runner node app www-data nginx postgres mysql redis nobody docker vagrant git jenkins circleci gitlab-runner builder build ci default guest public shared'.split(' '));
  const PROMPT_RES = [
    // [jdoe@prod-web-03 app]$
    /^(\s*(?:\([\w.-]+\)\s+)?)\[([a-z_][\w.-]*)@([\w.-]+)\s+([^\]]*)\]([$#%>])/,
    // jdoe@host:~/x$   jdoe@MacBook-Pro ~/work/acme %   jdoe@mbp acme-billing %
    /^(\s*(?:\([\w.-]+\)\s+)?)([a-z_][\w.-]*)@([\w.-]+)(?::\s*|\s+)(\S*?)\s*([$#%>❯»])(?=\s|$)/,
  ];

  function learnName(kind, name, ctx) {
    if (!name || name.length < 2) return null;
    if (kind === 'user' && GENERIC_USERS.has(name.toLowerCase())) return null;
    if (kind === 'machine' && /^(?:localhost|machine\d+)$/i.test(name)) return null;
    return aliasFor(ctx.table, kind, kind === 'person' ? name : name.toLowerCase());
  }

  function registrable(host) {
    const l = host.toLowerCase().replace(/\.$/, '').split('.');
    if (l.length < 2) return null;
    const two = l.slice(-2).join('.');
    return /^(?:co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(two) && l.length >= 3 ? l.slice(-3).join('.') : two;
  }
  // A private host in a link (https://edc.corp-example.com/…) marks its whole domain as private,
  // so bare mentions (node-7.edc.corp-example.com) are hidden too — in this paste and later ones.
  function learnDomains(text, ctx) {
    const re = /\b(?:https?|wss?|grpcs?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/(?:[^\s@/]+@)?([A-Za-z0-9.-]+)/g;
    let m;
    while ((m = re.exec(text))) {
      const host = m[1].replace(/\.$/, '');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || isPublicHost(host, ctx) || !host.includes('.')) continue;
      const d = registrable(host);
      if (d && !isPublicHost(d, ctx)) aliasFor(ctx.table, 'domain', d);
    }
    for (const key of Object.keys(ctx.table.forward)) {
      if (key.startsWith('domain\u0000')) {
        const d = key.slice(7);
        if (!ctx.privateDomains.includes(d)) ctx.privateDomains.push(d);
      }
    }
  }

  // Config dumps: the value of bucket / endpoint / server_addr / host … is identifying wherever it appears.
  // Identifying keys, in any style: namespace=, "namespace":, kubernetes_namespace="…", k8s.namespace.name="…", 'pod': '…'
  const KEY_CORE = 'bucket|endpoint|server_addr|bind_addr|advertise_addr|hostname|host|fqdn|domain|cluster|account|tenant|project|' +
    'namespace|pod|container|deployment|statefulset|daemonset|replicaset|service|app|release|job|node|product|customer|' +
    'organization|organisation|org|company|site|datacenter|data_center|serial_number|serial|asset_tag|asset|device|system';
  const KEYED = new RegExp('(?<![\\w])((?:[A-Za-z0-9]+[_.])*?(' + KEY_CORE + ')(?:[_.](?:name|id|tag|number|key))?)["\']?\\s*[:=]\\s*(?:Some\\(\\s*)?' +
    '(?:"([^"\\n]{2,80})"|\'([^\'\\n]{2,80})\'|([A-Za-z0-9][\\w.-]{2,}(?::\\d+)?))', 'gi');
  const SVC_KEYS = /^(?:pod|container|deployment|statefulset|daemonset|replicaset|service|app|release|job)$/;
  const WORD_KEYS = /^(?:account|tenant|project|cluster|namespace|product|customer|organization|organisation|org|company|site|datacenter|data_center)$/;
  const ID_KEYS = /^(?:serial_number|serial|asset_tag|asset|device)$/;

  function learnKeyed(text, ctx) {
    let m;
    KEYED.lastIndex = 0;
    while ((m = KEYED.exec(text))) {
      const core = m[2].toLowerCase();
      const val = (m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5]).trim().replace(/:\d+$/, '');
      if (!val || val.length < 3) continue;
      if (/^(?:\d+\.){3}\d+$|^(?:localhost|none|null|true|false|default|public|private|auto|disable|enable|us|eu|ap|unknown|n\/a)$/i.test(val)) continue;
      if (/^(?:host|machine|user|bucket|str|mail|project|service|org|ID-)\d+/.test(val) || /\.example\.(?:internal|com)$/.test(val)) continue;
      if (/^[a-z]{2}-[a-z]+-\d$/.test(val)) continue;                                   // cloud region names like us-east-1
      if (/^[\d.]+$/.test(val) && !ID_KEYS.test(core)) continue;                        // numbers are ids, not names
      if (/^[<{[(]|^\$\{|\s{2}/.test(val)) continue;                                   // templates, objects, prose
      if (isPublicHost(val, ctx) || isKept(val)) continue;
      if (GENERIC_WORDS.test(val) || /^(?:s3|http|https|grpc|tcp|udp|kafka|redis|postgres|mysql|default|kube-system|istio-system|monitoring|ingress-nginx|cert-manager|main|app|web|api|linux|windows|darwin|production|prod|staging|dev|test|true|false)$/i.test(val)) continue;
      if (core === 'system' && !/\./.test(val)) continue;                               // system=linux etc.
      if (core === 'bucket') aliasFor(ctx.table, 'bucket', val);
      else if (SVC_KEYS.test(core)) {
        // a pod name is <workload>-<replicaset hash>-<pod id> (or <workload>-<ordinal>): hide the workload name everywhere
        const base = val.replace(/-[a-z0-9]{8,10}-[a-z0-9]{5}$/, '').replace(/-[a-z0-9]{5}$/, '').replace(/-\d+$/, '');
        if (base.length >= 4 && !GENERIC_WORDS.test(base)) aliasFor(ctx.table, 'service', base.toLowerCase());
      }
      else if (WORD_KEYS.test(core)) aliasFor(ctx.table, 'word', val.toLowerCase());
      else if (ID_KEYS.test(core)) aliasFor(ctx.table, 'id', val);
      else if (core === 'node') aliasFor(ctx.table, 'host', val.toLowerCase());
      else {
        aliasFor(ctx.table, 'host', val.toLowerCase());
        // in-cluster names (svc.namespace) end in their namespace: hide it, so sibling services are hidden too
        const labels = val.toLowerCase().split('.');
        const last = labels[labels.length - 1];
        if (labels.length >= 2 && !COMMON_TLD.test(last) && !INTERNAL_TLD.test(val) && /[-\d]/.test(last) && !/^(?:svc|cluster|local|default)$/.test(last)) aliasFor(ctx.table, 'word', last);
      }
    }
  }

  // Distinctive words of the company itself: com.<acmecorp>.billing, <Contoso>.Airline, <corp-example>.com
  const GENERIC_WORDS = /^(?:app|apps|core|common|util|utils|service|services|api|internal|impl|main|server|client|web|lib|libs|base|shared|platform|example|test|tests|demo|sample|module|mod|project|code|src)$/i;
  function learnWords(ctx) {
    for (const key of Object.keys(ctx.table.forward)) {
      const i = key.indexOf('\u0000');
      const kind = key.slice(0, i), orig = key.slice(i + 1);
      let w = null;
      if (kind === 'pkg') { const sg = orig.split('.'); w = /^(?:com|org|net|io|co|de|uk|ai|dev|app|in|fr|nl|jp|cn)$/.test(sg[0]) ? sg[1] : null; }
      else if (kind === 'ns') w = orig.split('.')[0];
      else if (kind === 'domain') w = orig.split('.')[0];
      if (!w || w.length < 4 || GENERIC_WORDS.test(w) || isKept(w) || ctx.isPublicName(orig)) continue;
      if (kind === 'pkg' && isKept(orig.split('.').slice(0, 2).join('.') + '.')) continue;
      aliasFor(ctx.table, 'word', w.toLowerCase());
    }
  }

  // Scan the whole paste first so a username seen once is hidden on every line.
  function learnIdentity(text, ctx) {
    if (!ctx.o.hideIdentity) return;
    let m;
    const homeRe = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)([A-Za-z0-9_][\w.-]*)/g;
    while ((m = homeRe.exec(text))) learnName('user', m[1], ctx);
    for (const line of text.split('\n')) {
      for (const re of PROMPT_RES) {
        if ((m = re.exec(line))) { learnName('user', m[2], ctx); learnName('machine', m[3], ctx); dirAlias(m[4], ctx); break; }
      }
      if ((m = /^\s*(?:Author|Commit|Committer|Signed-off-by|Co-authored-by|Reviewed-by):\s*([^<\n]+?)\s*</.exec(line))) learnName('person', m[1].trim(), ctx);
      if ((m = /\b(?:USER|USERNAME|LOGNAME)=([A-Za-z0-9_][\w.-]*)/.exec(line))) learnName('user', m[1], ctx);
      if ((m = /\b(?:HOSTNAME|COMPUTERNAME)=([A-Za-z0-9_][\w.-]*)/.exec(line))) learnName('machine', m[1], ctx);
    }
  }

  const GENERIC_DIRS = /^(?:src|app|apps|lib|code|work|projects?|source|repos?|dev|build|dist|tmp|temp|home|Desktop|Documents|Downloads|Movies|Music|Pictures|Public|Library|Applications|bin|etc|var|opt|usr|log|logs|Users|www|html)$/i;

  function dirAlias(dir, ctx) {
    if (!dir || dir === '~' || dir === '/' || dir === '.' ) return dir;
    const clean = dir.replace(/[\\/]+$/, '');
    const base = clean.split(/[\\/]/).pop();
    if (!base || base === '~') return dir;
    if (GENERIC_DIRS.test(base)) {
      // ~/work/Downloads stays readable; anything private above it is dropped
      return (/^~|^(?:\/Users|\/home|[A-Za-z]:\\Users)/.test(clean) ? '~/' : /^[\\/]/.test(clean) ? '/' : '') + base;
    }
    const prefix = /^~/.test(clean) || /^(?:\/Users|\/home|[A-Za-z]:\\Users)/.test(clean) ? '~/' : /^[\\/]/.test(clean) ? '/' : /^[A-Za-z]:\\/.test(clean) ? clean.slice(0, 3) : '';
    return prefix + aliasFor(ctx.table, 'dir', base);
  }

  function rewritePrompt(line, ctx) {
    if (!ctx.o.hideIdentity) return line;
    let m;
    if ((m = PROMPT_RES[0].exec(line))) {
      return m[1] + '[' + (learnName('user', m[2], ctx) || m[2]) + '@' + (learnName('machine', m[3], ctx) || m[3]) + ' ' + dirAlias(m[4], ctx) + ']' + m[5] + line.slice(m[0].length);
    }
    if ((m = PROMPT_RES[1].exec(line))) {
      const sep = line.slice(m.index + m[1].length).match(/^[^@]+@[\w.-]+(:\s*|\s+)/)[1];
      return m[1] + (learnName('user', m[2], ctx) || m[2]) + '@' + (learnName('machine', m[3], ctx) || m[3]) + sep + dirAlias(m[4], ctx) + (m[4] ? ' ' : '') + m[5] + line.slice(m[0].length);
    }
    if ((m = /^(\s*PS\s+)([A-Za-z]:\\[^>]*)>/.exec(line))) return m[1] + dirAlias(m[2], ctx) + '>' + line.slice(m[0].length);
    if ((m = /^(\s*)([A-Za-z]:\\[^>\s]*)>(?=\S|\s|$)/.exec(line))) return m[1] + dirAlias(m[2], ctx) + '>' + line.slice(m[0].length);
    if ((m = /^(\s*(?:➜|→|λ)\s+)(\S+)(\s+git:\()([^)]+)(\))/.exec(line))) {
      return m[1] + dirAlias(m[2], ctx) + m[3] + aliasFor(ctx.table, 'branch', m[4]) + m[5] + line.slice(m[0].length);
    }
    return line;
  }

  // Replace every learned username / machine / person, on any line.
  function hideIdentity(text, ctx) {
    if (typeof text !== 'string') return text;
    const T = ctx.table;
    let t = text;
    for (const key of Object.keys(T.forward)) {
      const i = key.indexOf('\u0000');
      const kind = key.slice(0, i);
      if (!['user', 'machine', 'person', 'dir', 'domain', 'bucket', 'word', 'host', 'service', 'id'].includes(kind)) continue;
      if (!ctx.o.hideIdentity && ['user', 'machine', 'person', 'dir'].includes(kind)) continue;
      if (kind === 'word' && KEEP && [...KEEP].some((k) => k.toLowerCase().split(/[.\/]/).includes(key.slice(i + 1)))) continue;
      const orig = key.slice(i + 1);
      if (isKept(orig)) continue;
      if (orig.length < (kind === 'dir' || kind === 'word' ? 4 : 3)) continue;
      if (kind === 'id' && !/\d/.test(orig)) continue;
      if (kind === 'host' && !/[.-]/.test(orig)) continue;
      if (kind === 'dir' && GENERIC_DIRS.test(orig)) continue;
      t = t.replace(new RegExp((kind === 'word' || kind === 'service' || kind === 'id' ? '(?<![\\w])' : '(?<![\\w.])') + escapeRe(orig) + '(?![\\w])', 'gi'), T.forward[key]);
      // possessive machine names: "Janes-MacBook-Pro" also covers "janes"
    }
    return t;
  }

  // ---------------------------------------------------------------------------
  // Secrets — redacted outright, never stored, never restored
  // ---------------------------------------------------------------------------

  const SECRET_RULES = [
    ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
    ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
    ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
    ['slack-token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g],
    ['stripe-key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
    ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
    ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
    ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
    ['bearer', /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g],
  ];

  function luhn(d) {
    let sum = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
    return sum % 10 === 0;
  }
  const mask = (v) => { v = String(v || ''); return v.length <= 6 ? '•'.repeat(v.length) : v.slice(0, 4) + '…(' + v.length + ' chars)'; };
  function found(ctx, type, value) { ctx.stats.secrets++; ctx.secretsFound.push({ type, hint: mask(value) }); }

  function redactSecrets(text, ctx) {
    let t = text;
    for (const [type, re] of SECRET_RULES) {
      t = t.replace(re, (m, g1) => {
        if (type === 'bearer') { found(ctx, 'bearer token', m.slice(g1.length).trim()); return g1 + ' <secret:token>'; }
        found(ctx, type === 'private-key' ? 'private key' : type, type === 'private-key' ? '-----BEGIN' : m);
        return '<secret:' + type + '>';
      });
    }
    // credentials inside connection strings: scheme://user:pass@host
    t = t.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi, (m, scheme, user, pass) => {
      found(ctx, 'password in a URL', pass);
      return scheme + '<user>:<secret:password>@';
    });
    // key=value style secrets
    t = t.replace(
      /(?<![<\w-])((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|secret|password|passwd|pwd|private[_-]?key|session[_-]?id|x-api-key|token)["']?\s*[:=]\s*["']?)([^\s"',;&}]{4,})/gi,
      (m, k, v) => {
        if (/^<secret:/.test(v)) return m;
        found(ctx, k.replace(/["'\s:=]+$/, '').toLowerCase(), v);
        return k + '<secret>';
      }
    );
    // long digit runs (card / account numbers)
    t = t.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m, off, str) => {
      if (/^\d{4}-\d{2}-\d{2}/.test(m)) return m;
      if (!luhn(m.replace(/\D/g, ''))) return m;                                        // not a card number
      if (/(?:id|ids|namespace|region|entry|offset|seq|sequence|ts|timestamp|time|size|bytes|count|epoch|version|commit|hash|span|trace)[\s"'_:=(\[{-]{0,4}$/i.test(str.slice(Math.max(0, off - 24), off))) return m;
      if (/^\(\d/.test(str.slice(off + m.length, off + m.length + 2))) return m;          // 12884901889(3, 1)
      found(ctx, 'card / account number', m.replace(/\D/g, ''));
      return '<secret:number>';
    });
    return t;
  }

  // ---------------------------------------------------------------------------
  // Free-text sanitiser — log messages, exception messages
  // ---------------------------------------------------------------------------

  function isPublicHost(host, ctx) {
    host = host.toLowerCase();
    if (ctx.privateDomains.some((d) => host === d || host.endsWith('.' + d))) return false;
    if (/^(?:127\.|0\.0\.0\.0$|\[?::1\]?$)/.test(host)) return true;
    return PUBLIC_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  }

  function sanitizeText(text, ctx, how) {
    const T = ctx.table;
    let t = rewritePrompt(text, ctx);
    if (ctx.o.hideIdentity) {
      t = t.replace(/^(\s*(?:Author|Commit|Committer|Signed-off-by|Co-authored-by|Reviewed-by):\s*)([^<\n]+?)(\s*<)/, (m, a, name, b) => a + (learnName('person', name.trim(), ctx) || name) + b);
    }

    // home directories
    t = t.replace(/(?:\/Users|\/home)\/[^/\s"']+/g, '~');
    t = t.replace(/[A-Za-z]:\\Users\\[^\\\s"']+/g, '~');

    // filesystem paths (after home-dir collapse)
    t = t.replace(/(?<![\w:/.~<-])((?:~(?!\/\.)|\/(?:srv|opt|var|app|apps|usr|etc|tmp|mnt|data|workspace|workspaces|code|src|build|root|private|deploy|services|projects))(?:\/[\w.@+-]+)+)/g, (m) => {
      if (/node_modules|site-packages|dist-packages/.test(m)) return shortenPublicPath(m);
      if (/^~\/project\d+$|^\/app\/path\d+/.test(m)) return m;
      // system / software paths (/etc/myapp/config.toml, /data/x/wal) stay readable;
      // any learned private word inside them (company, project, username) is still swapped later
      if (!/^~/.test(m)) return m;
      // inside a project folder we already know: ~/work/acme-billing/src/x.ts -> ~/project1/src/x.ts
      const segs = m.split('/');
      for (let k = segs.length - 1; k > 0; k--) {
        const d = T.forward['dir\u0000' + segs[k]];
        if (d) return '~/' + d + (k < segs.length - 1 ? '/' + aliasFor(T, 'path', segs.slice(k + 1).join('/'), extOf(m)).replace(/^\/app\//, '') : '');
      }
      return aliasFor(T, 'path', m, extOf(m));
    });
    t = t.replace(/\b[A-Za-z]:\\(?:[\w.@+ -]+\\)*[\w.@+-]+/g, (m) => aliasFor(T, 'path', m, extOf(m)));
    t = t.replace(/~\\(?:[\w.@+-]+\\)*[\w.@+-]+/g, (m) => aliasFor(T, 'path', m, extOf(m)));
    // relative source files in compiler output: src/billing/tierCap.ts(42,7): error ...
    t = t.replace(/(?<![\w./\\<-])((?:[\w.-]+[\/\\])+[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|vue|svelte|py|java|kt|scala|go|rs|rb|php|cs|fs|vb|cpp|cc|c|h|hpp|swift|m|mm|dart|ex|exs|erl|clj))(?=\(\d+[,)]|:\d+(?::\d+)?(?::|\s|$)|\s+line\s+\d+)/g, (m) => {
      if (/node_modules|site-packages|dist-packages|^(?:app|src)[\/](?:file|module)\d+/.test(m)) return m;
      // inside a project folder already renamed (e.g. from the prompt): keep the layout, the folder name gets swapped later
      if (T.forward['dir\u0000' + m.split(/[\/\\]/)[0]]) return m;
      return aliasFor(T, 'srcfile', m, extOf(m));
    });

    // emails
    t = t.replace(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, (m, host) => {
      if (/^(?:example\.(?:com|org)|users\.noreply\.github\.com)$/i.test(host)) return m;
      return aliasFor(T, 'email', m.toLowerCase());
    });

    // URLs: alias private hosts, drop query strings
    t = t.replace(/\b(https?|wss?|grpcs?|jdbc:[a-z]+|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/(<user>:<secret:password>@)?([A-Za-z0-9.-]+)(:\d+)?([^\s"'<>)\]]*)/g,
      (m, scheme, cred, host, port, rest) => {
        let h = host;
        if (!isPublicHost(host, ctx) && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) h = aliasFor(T, 'host', host.toLowerCase().replace(/\.$/, ''));
        let r = rest || '';
        const q = r.indexOf('?');
        if (q >= 0) r = r.slice(0, q) + '?<query>';
        return scheme + '://' + (cred || '') + h + (port || '') + r;
      });

    // bare hostnames: internal TLDs, private domains (configured or learned from links), and deep FQDNs
    t = t.replace(/(?<![\w.@-])((?:[a-z0-9][a-z0-9-]*\.){1,}[a-z]{2,})\.?(?=[:\s/,;)'"\]}\\]|$)/gi, (m, host) => {
      if (/\.example\.(?:internal|com|org)$/i.test(host)) return m;
      const lower = host.toLowerCase();
      const labels = lower.split('.');
      const tld = labels[labels.length - 1];
      if (!COMMON_TLD.test(tld) && !INTERNAL_TLD.test(lower)) return m;       // java.lang.Thread, file.log …
      if (/[A-Z]/.test(host.split('.').pop())) return m;                      // Capitalised last part: a class name
      const priv = INTERNAL_TLD.test(lower) || ctx.privateDomains.some((d) => lower === d || lower.endsWith('.' + d)) || (labels.length >= 4 && !isPublicHost(lower, ctx));
      return priv ? aliasFor(T, 'host', lower.replace(/\.$/, '')) : m;
    });

    // IPv4 (skip loopback / any / documentation ranges)
    t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => {
      if (/^(?:127\.|0\.0\.0\.0|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|255\.)/.test(m)) return m;
      if (m.split('.').some((p) => +p > 255)) return m;
      return aliasFor(T, 'ip', m);
    });

    // UUIDs
    t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => {
      if (/^00000000-0000-4000-8000-/.test(m)) return m;
      return aliasFor(T, 'uuid', m.toLowerCase());
    });

    // business IDs like INV-2291, ORD-99812
    t = t.replace(/(?<![\w.-])[A-Z]{2,6}-\d{3,}(?![\w-]|\.\w)/g, (m) =>
      /^(?:ISO|SHA|RFC|CVE|CWE|UTF|PEP|JSR|JEP|KIP|FLIP|ECMA|IEEE|HTTP|TLS|SSL|MD|AES|RSA|DES|HMAC|CRC|ANSI|IEC|NIST|FIPS|GDPR|SOC|PCI|HIPAA|WCAG|POSIX|ASCII|EN|DIN|BS|GB|JIS|X|ES|IPv|COVID|SARS|MP|MPEG|H|BT|DDR|PCIE|USB|LTE|ARM|AMD|ACL|IETF|W3C|OWASP|SPDX|GPL|AGPL|LGPL|BSD|MIT|CC)-/.test(m) ? m : aliasFor(T, 'id', m));

    // source code: package / import (Java, Kotlin, Scala) and namespace / using (C#) declarations
    t = t.replace(/^(\s*(?:package|import(?:\s+static)?)\s+)([a-z_][\w]*(?:\.[a-z_][\w]*)+)((?:\.[A-Z][\w$]*)*)((?:\.\*)?\s*;?\s*)$/gm, (m, kw, pkg, cls, tail) => {
      if (ctx.isPublicName(pkg + '.') || pkg.split('.').length < 2 || /^app\.mod\d+$/.test(pkg)) return m;
      return kw + aliasFor(T, 'pkg', pkg) + cls.split('.').map((c) => c ? aliasClassName(c, ctx) : c).join('.') + tail;
    });
    t = t.replace(/^(\s*(?:namespace|using(?:\s+static)?)\s+)([A-Z][\w]*(?:\.[A-Z][\w]*)+)(\s*[;{]?\s*)$/gm, (m, kw, ns, tail) => {
      if (ctx.isPublicName(ns + '.') || /^App\.Ns\d+/.test(ns)) return m;
      return kw + aliasFor(T, 'ns', ns) + tail;
    });

    // dotted fully-qualified names (com.acme.billing.InvoiceService, c.a.b.InvoiceService)
    t = t.replace(/(?<![\w$./\\-])((?:[a-z_][\w$]*\.){2,})([A-Z][\w$]*)(?![\w$])/g, (m, pkgDot, cls) => {
      if (/^app\.mod\d+\.$/.test(pkgDot)) return m;
      if (ctx.isPublicName(m)) return m;
      const pkg = pkgDot.slice(0, -1);
      if (/^(?:e\.g|i\.e|etc|vs|www|http|https)$/i.test(pkg)) return m;
      return aliasFor(T, 'pkg', pkg) + '.' + aliasClassName(cls, ctx);
    });

    // company exception names mentioned on their own: AcmeStorageQuotaException -> AppError1
    t = t.replace(/(?<![\w.$\/-])([A-Z][A-Za-z0-9]*?[a-z0-9](?:Exception|Error|Fault|Failure))(?![\w$])/g, (m) => {
      if (PUBLIC_ERRORS.has(m) || COMMON_BARE_EXC.has(m) || isKept(m) || /^(?:AppError|Class)\d+$/.test(m)) return m;
      return aliasFor(T, 'exc', m);
    });

    // quoted values
    if (ctx.o.aliasStrings && how && how.quotes) t = aliasQuoted(t, ctx, 0);

    t = replaceKnownNames(t, ctx);
    t = replacePrivateTerms(t, ctx);
    return t;
  }

  // Quoted values: walk the string left to right, one quoted token at a time, so the text
  // *between* two quoted words is never mistaken for a value ("changed": true, "msg" …).
  const QUOTE_TOKEN = /\\"((?:[^"\\\n]|\\(?!"))*?)\\"|"((?:[^"\\\n]|\\.)*)"|(?<![\w])'([^'\n]*)'(?![\w])|`([^`\n]*)`/g;
  const KEEP_VALUE = [
    /^<.*>$/, /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \//, /^(?:str|Class|method|func|AppError|Term|ID-|user|machine|project|Person)\d+$/,
    /^[\d\s.,:%+\/-]*$/, /^(?:null|undefined|true|false|None|NaN|GET|POST|PUT|PATCH|DELETE|yes|no|on|off)$/i,
    /^(?:string|number|boolean|bigint|symbol|object|any|unknown|never|void|int|float|double|long|short|char|byte|bool|str|dict|list|tuple|set|bytes|NoneType|String|Integer|Long|Double|Boolean|Object|Number|Array|Promise|Date|Map|Set|Record|Function|int32|int64|uint|float64|string\[\]|number\[\])(?:\s*\|\s*(?:undefined|null))?$/,
    /^app\/(?:module|file)\d+/, /^(?:https?|wss?):\/\//, /^host\d+\.example\.internal/, /^[\w.+-]+@example\.com$/,
    /^\\[rnt]$/,
    /^(?:http-nio|https-jsse-nio|http-bio|nio|exec|pool|thread|main|worker|scheduling|task|async|ForkJoinPool|reactor|boundedElastic|parallel|kafka|grpc|netty|qtp|default|catalina|Timer|Finalizer|Signal Dispatcher)[\w.-]*$/i,
  ];
  function aliasQuoted(text, ctx, depth) {
    return text.replace(QUOTE_TOKEN, (m, esc, dq, sq, bq, off, str) => {
      const inner = esc !== undefined ? esc : dq !== undefined ? dq : sq !== undefined ? sq : bq;
      const open = esc !== undefined ? '\\"' : dq !== undefined ? '"' : sq !== undefined ? "'" : '`';
      if (/^\s*:(?!\/\/)/.test(str.slice(off + m.length))) return m;          // a key, not a value
      if (!inner) return m;
      // prose or long values: keep the words, but look inside for nested quoted values
      const prose = /\s/.test(inner) && !/^(?:[A-Z][\w&.-]*)(?:\s+[A-Z][\w&.-]*){0,3}$/.test(inner);
      if (prose || inner.length > 160) return depth < 3 ? open + aliasQuoted(inner, ctx, depth + 1) + open : m;
      if (KEEP_VALUE.some((re) => re.test(inner))) return m;
      return open + aliasFor(ctx.table, 'str', inner) + open;
    });
  }

  // Structured (JSON) log lines: keep keys, sanitise values.
  function sanitizeJsonLine(line, ctx) {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return null; }
    const walk = (v, key) => {
      if (typeof v === 'string') {
        if (/^(?:level|lvl|severity|time|timestamp|ts|@timestamp|pid|hostname_type|v)$/i.test(key || '')) return v;
        return sanitizeText(v, ctx);
      }
      if (Array.isArray(v)) return v.map((x) => walk(x, key));
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k], k); return o; }
      return v;
    };
    return JSON.stringify(walk(obj));
  }

  // Names we already aliased elsewhere (frames, headers) mentioned bare in messages.
  function replaceKnownNames(text, ctx) {
    const T = ctx.table;
    const pairs = [];
    for (const key of Object.keys(T.forward)) {
      const i = key.indexOf('\u0000');
      const kind = key.slice(0, i);
      const orig = key.slice(i + 1);
      if (!['cls', 'exc', 'method', 'func', 'pkg', 'str'].includes(kind)) continue;
      if (isKept(key.slice(i + 1))) continue;
      if (kind === 'str' && (/\s/.test(orig) || !/_|[a-z][A-Z]/.test(orig))) continue;
      const identLike = /[a-z][A-Z]|_|\d/.test(orig) || ((kind === 'cls' || kind === 'exc' || kind === 'str') && /^[A-Z]/.test(orig) && orig.length >= 6);
      if (!identLike || orig.length < 4) continue;
      pairs.push([orig, T.forward[key]]);
    }
    if (!pairs.length) return text;
    pairs.sort((a, b) => b[0].length - a[0].length);
    let t = text;
    for (const [orig, alias] of pairs) {
      t = t.replace(new RegExp('(?<![\\w$])' + escapeRe(orig) + '(?![\\w$])', 'g'), alias);
    }
    return t;
  }

  function replacePrivateTerms(text, ctx) {
    let t = text;
    for (const term of ctx.privateTerms) {
      if (isKept(term)) continue;                        // "Don't hide" wins over "always hide"
      const alias = aliasFor(ctx.table, 'term', term.toLowerCase());
      t = t.replace(new RegExp(escapeRe(term), 'gi'), alias);
    }
    return t;
  }

  // ---------------------------------------------------------------------------
  // Name aliasing for frames
  // ---------------------------------------------------------------------------

  function aliasClassName(cls, ctx) {
    // Outer$Inner$$SpringCGLIB$$0, lambda$reconcile$3
    return cls.split('$').map((part) => {
      if (!part || /^\d+$/.test(part) || GENERIC_NAMES.has(part) || /^[0-9a-f]{6,}$/i.test(part)) return part;
      if (/^(?:Class|AppError)\d+$/.test(part)) return part;
      return aliasFor(ctx.table, /(?:Exception|Error)$/.test(part) ? 'exc' : 'cls', part);
    }).join('$');
  }

  function aliasMethodName(m, ctx) {
    if (GENERIC_NAMES.has(m)) return m;
    if (m.includes('$')) {
      // lambda$reconcile$0 / access$000
      return m.split('$').map((p) => (!p || /^\d+$/.test(p) || GENERIC_NAMES.has(p)) ? p : aliasFor(ctx.table, 'method', p)).join('$');
    }
    return aliasFor(ctx.table, 'method', m);
  }

  function aliasJsFunction(name, ctx) {
    // "async InvoiceService.reconcile", "new InvoiceService", "Object.<anonymous>", "Array.map"
    return name.split(/(\s+|\.|\[as |\])/).map((part) => {
      if (!part || /^\s+$/.test(part) || part === '.' || part === '[as ' || part === ']') return part;
      if (GENERIC_NAMES.has(part) || /^<.*>$/.test(part) || /^\d+$/.test(part)) return part;
      if (/^(?:fn|func|method|Class)\d+$/.test(part)) return part;
      if (/^[A-Z]/.test(part)) return aliasFor(ctx.table, /(?:Exception|Error)$/.test(part) ? 'exc' : 'cls', part);
      return aliasFor(ctx.table, 'func', part);
    }).join('');
  }

  function extOf(path) {
    const m = /(\.[A-Za-z0-9]{1,5})$/.exec(path);
    return m ? m[1] : '';
  }

  // ---------------------------------------------------------------------------
  // Line classifiers
  // ---------------------------------------------------------------------------

  const RE = {
    javaFrame: /^(\s*at\s+(?:TRACE ID [0-9a-fA-F]+\s+)?)(?:([\w.-]+(?:@[\w.-]+)?)\/)?([\w$.<>]+)\.([\w$<>-]+)\(([^()]*)\)\s*(\[[^\]]*\])?\s*$/,
    javaLoc: /^(?:[\w$-]+\.(?:java|kt|kts|scala|groovy|clj):\d+|Native Method|Unknown Source|<generated>|SourceFile(?::\d+)?|[\w$-]+\.(?:java|kt|kts|scala|groovy))$/,
    dotnetFrame: /^(\s*)at\s+(.+?)\((.*?)\)(?:\s+in\s+(.+?):line\s+(\d+))?\s*$/,
    javaMore: /^\s*\.\.\.\s*\d+\s+(?:more|common frames omitted)\s*$/,
    pyTraceback: /^\s*Traceback \(most recent call last\):\s*$/,
    pyFrame: /^(\s*)File "([^"]+)", line (\d+)(?:, in (.+))?$/,
    pyChain: /^\s*(?:During handling of the above exception, another exception occurred:|The above exception was the direct cause of the following exception:)\s*$/,
    pyCaret: /^\s*[~^]+\s*$/,
    jsFrame: /^(\s*)at\s+(async\s+)?(?:(.+?)\s+\()?((?:file:\/\/|webpack:\/\/|https?:\/\/|node:|internal\/|\/|[A-Za-z]:\\|\.{0,2}\/?[\w@.-]+\/)?[^\s()]*?):(\d+):(\d+)\)?\s*$/,
    jsFrameNoLoc: /^(\s*)at\s+(.+?)\s+\((native|<anonymous>|index \d+)\)\s*$/,
    jsFrameBare: /^(\s*)at\s+(async\s+)?([\w$.<>\[\] ]+?)\s*$/,
    ffFrame: /^(\s*)([\w$.<>/[\]]*)@(.+?):(\d+):(\d+)\s*$/,
    nodeLocHeader: /^((?:file:\/\/)?(?:\/|[A-Za-z]:\\|\.\/)[^\s:]+\.(?:js|mjs|cjs|ts|mts|cts|jsx|tsx)):(\d+)\s*$/,
    excHeader: /^(\s*)((?:Exception in thread "[^"]*"\s+)?(?:Caused by:\s*|Suppressed:\s*|Wrapped by:\s*|Unhandled exception\.\s*|Unhandled Exception:\s*)?)((?:[A-Za-z_$][\w$]*\.)+[A-Z][\w$]*?(?:Exception|Error|Throwable|Fault|Failure|Exit|Interrupt|Warning)[\w$]*)(?:(:\s?)(.*))?$/,
    simpleErr: /^(\s*)((?:Uncaught\s+(?:\(in promise\)\s+)?|Unhandled Rejection:?\s+|Error:\s+(?=\w+Error))?)([A-Z][\w$]*(?:Error|Exception|Exit|Interrupt|Warning|Fault))(\s*\[[\w-]+\])?(?:(:\s?)(.*))?$/,
    termError: /^(?:npm ERR!|npm error|yarn error|error(?:\[E\d+\])?:|fatal:|panic:|FAILED|Error:|ERROR\b)|\berror (?:TS|CS|C)\d+:|: error:|\bcommand not found\b|\bPermission denied\b|\bNo such file or directory\b|\bSegmentation fault\b/,
    logLevel: /\b(?:FATAL|ERROR|SEVERE|CRITICAL|CRIT|PANIC|EMERG|ALERT)\b|\blevel[=:]\s*"?(?:error|fatal|critical)\b|"level"\s*:\s*"(?:error|fatal|critical)"/i,
    warnLevel: /\b(?:WARN|WARNING)\b|\blevel[=:]\s*"?warn(?:ing)?\b|"level"\s*:\s*"warn(?:ing)?"/i,
    anyLevel: /\b(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|SEVERE|CRITICAL)\b/,
  };

  const SECTION_RE = /^(?:TASK|PLAY|RUNNING HANDLER|HANDLER) \[|^##\[group\]|^==> |^> Task :|^\[\d+\/\d+\] |^Step \d+\/\d+ :|^#\d+ \[|^\s*\[INFO\] --- [\w.-]+:|^-{3,} ?\[?[A-Za-z]/;

  function isPromptLine(line) {
    return PROMPT_RES.some((re) => re.test(line)) || /^\s*PS\s+[A-Za-z]:\\[^>]*>/.test(line) || /^\s*(?:➜|→|λ)\s+\S+/.test(line);
  }

  function isPublicJsLocation(loc) {
    return /node_modules|^node:|^internal\/|^native$|<anonymous>|^index \d+|react-dom|react\.production|vendor[s~.-]|chunk-vendors|framework-[0-9a-f]|webpack\/(?:bootstrap|runtime)|zone\.js|polyfills/.test(loc);
  }

  function isPublicPyPath(p) {
    return /site-packages|dist-packages|[\\/]lib[\\/]python\d|[\\/]Lib[\\/]|^<frozen |^<string>$|^<stdin>$|[\\/]python\d(?:\.\d+)?[\\/]/.test(p) && !/^<stdin>$/.test(p);
  }

  function shortenPublicPath(p) {
    let m;
    if ((m = /(?:site|dist)-packages[\\/](.*)$/.exec(p))) return '<site-packages>/' + m[1].replace(/\\/g, '/');
    if ((m = /[\\/]lib[\\/](python\d(?:\.\d+)?)[\\/](.*)$/i.exec(p))) return '<' + m[1] + '>/' + m[2].replace(/\\/g, '/');
    if ((m = /node_modules[\\/](.*)$/.exec(p))) return 'node_modules/' + m[1].replace(/\\/g, '/');
    return p;
  }

  // ---------------------------------------------------------------------------
  // Frame rewriters — return { text, kind: 'public'|'private', lang }
  // ---------------------------------------------------------------------------

  function rewriteJavaFrame(m, ctx) {
    const [, indent, module, fqcn, method, loc, suffix] = m;
    const pub = ctx.isPublicName(fqcn);
    if (pub) {
      return { kind: 'public', lang: 'java', group: fqcn.split('.').slice(0, 3).join('.'),
        text: indent + (module ? module + '/' : '') + fqcn + '.' + method + '(' + loc + ')' };
    }
    const dot = fqcn.lastIndexOf('.');
    const pkg = dot > 0 ? fqcn.slice(0, dot) : '';
    const cls = dot > 0 ? fqcn.slice(dot + 1) : fqcn;
    const aCls = aliasClassName(cls, ctx);
    const aPkg = pkg ? aliasFor(ctx.table, 'pkg', pkg) + '.' : '';
    let aLoc = loc;
    const lm = /^([\w$-]+)(\.(?:java|kt|kts|scala|groovy|clj))(:\d+)?$/.exec(loc);
    if (lm) aLoc = aliasClassName(lm[1], ctx) + lm[2] + (lm[3] || '');
    return { kind: 'private', lang: 'java',
      text: indent + aPkg + aCls + '.' + aliasMethodName(method, ctx) + '(' + aLoc + ')' + (suffix && /~?\[\?:/.test(suffix) ? '' : '') };
  }

  function rewriteDotnetFrame(m, ctx) {
    const [, indent, full, params, path, line] = m;
    const dot = full.lastIndexOf('.');
    const typeName = dot > 0 ? full.slice(0, dot) : full;
    const method = dot > 0 ? full.slice(dot + 1) : '';
    if (ctx.isPublicName(typeName)) {
      return { kind: 'public', lang: 'dotnet', group: typeName.split('.').slice(0, 2).join('.'),
        text: indent + 'at ' + full + '(' + params + ')' + (path ? ' in ' + path + ':line ' + line : '') };
    }
    // Namespace.Type+Nested.<>c__DisplayClass5_0.<Method>b__1
    const segs = typeName.split('.');
    let idx = segs.length - 1;
    while (idx > 0 && /^</.test(segs[idx])) idx--;
    const ns = segs.slice(0, idx).join('.');
    const KEEP = /^(?:[+<>`]|c__DisplayClass\d+_\d+|d__\d+|c|\d+)$/;
    const typeOut = (ns ? aliasFor(ctx.table, 'ns', ns) + '.' : '') + segs.slice(idx).map((s) =>
      s.split(/([+<>`]|c__DisplayClass\d+_\d+|d__\d+)/).map((p) => (!p || KEEP.test(p) || GENERIC_NAMES.has(p)) ? p
        : aliasFor(ctx.table, /(?:Exception|Error)$/.test(p) ? 'exc' : 'cls', p)).join('')).join('.');
    const methodOut = method.split(/([<>]|b__\d+(?:_\d+)?|g__|\|\d+_\d+)/).map((p) => (!p || /^[<>]$|^b__\d+(?:_\d+)?$|^g__$|^\|\d+_\d+$/.test(p) || GENERIC_NAMES.has(p)) ? p : aliasFor(ctx.table, 'method', p)).join('');
    const paramsOut = params.split(',').map((p) => {
      const parts = p.trim().split(/\s+/);
      if (!parts[0]) return '';
      const type = parts[0];
      const typeAliased = /^(?:[A-Z]\w*\.)*(?:Int\d+|String|Boolean|Object|Decimal|Double|Single|Byte|Char|Guid|DateTime|DateTimeOffset|TimeSpan|CancellationToken|Task|IEnumerable|IList|List|Dictionary|Func|Action|HttpContext|ILogger)(?:`\d+)?(?:\[.*\])?$/.test(type) || type.startsWith('System.')
        ? type : (/^[A-Z]/.test(type) ? aliasClassName(type.replace(/\W.*$/, ''), ctx) + type.replace(/^\w+/, '') : type);
      return typeAliased + (parts[1] ? ' arg' : '');
    }).join(', ');
    const pathOut = path ? ' in ' + aliasFor(ctx.table, 'csfile', path, extOf(path)) + ':line ' + line : '';
    return { kind: 'private', lang: 'dotnet', text: indent + 'at ' + typeOut + '.' + methodOut + '(' + paramsOut + ')' + pathOut };
  }

  function rewriteJsFrame(m, ctx) {
    const [, indent0, asyncKw, fn, loc, line, col] = m;
    const indent = indent0 + 'at ' + (asyncKw || '');
    const pubLoc = isPublicJsLocation(loc) && !ctx.isForcedPrivate(loc);
    if (pubLoc) {
      return { kind: 'public', lang: 'js', group: (/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(loc) || [, loc.replace(/[:/].*$/, '')])[1],
        text: indent + (fn ? fn + ' (' : '') + shortenPublicPath(loc) + ':' + line + ':' + col + (fn ? ')' : '') };
    }
    const aLoc = aliasJsLocation(loc, ctx);
    const aFn = fn ? aliasJsFunction(fn, ctx) : '';
    return { kind: 'private', lang: 'js', text: indent + (aFn ? aFn + ' (' : '') + aLoc + ':' + line + ':' + col + (aFn ? ')' : '') };
  }

  function aliasJsLocation(loc, ctx) {
    const clean = loc.replace(/[?#].*$/, '');
    return aliasFor(ctx.table, 'jsfile', clean, extOf(clean) || '.js');
  }

  function rewritePyFrame(m, ctx) {
    const [, indent, path, line, fn] = m;
    if (isPublicPyPath(path) && !ctx.isForcedPrivate(path)) {
      return { kind: 'public', lang: 'py', group: (/(?:site|dist)-packages[\\/]([^\\/]+)/.exec(path) || [, 'stdlib'])[1],
        text: indent + 'File "' + shortenPublicPath(path) + '", line ' + line + (fn ? ', in ' + fn : '') };
    }
    const aPath = aliasFor(ctx.table, 'pyfile', path, extOf(path) || '.py');
    const aFn = fn ? (GENERIC_NAMES.has(fn) || /^<.*>$/.test(fn) ? fn : fn.split('.').map((p) => GENERIC_NAMES.has(p) ? p : (/^[A-Z]/.test(p) ? aliasFor(ctx.table, 'cls', p) : aliasFor(ctx.table, 'func', p))).join('.')) : '';
    return { kind: 'private', lang: 'py', text: indent + 'File "' + aPath + '", line ' + line + (aFn ? ', in ' + aFn : '') };
  }

  function rewriteExcName(name, ctx) {
    if (PUBLIC_ERRORS.has(name)) return name;
    if (name.includes('.')) {
      if (ctx.isPublicName(name)) return name;
      const dot = name.lastIndexOf('.');
      return aliasFor(ctx.table, 'pkg', name.slice(0, dot)) + '.' + aliasClassName(name.slice(dot + 1), ctx);
    }
    if (/^(?:AppError|Class)\d+$/.test(name)) return name;
    return aliasFor(ctx.table, 'exc', name);
  }

  // ---------------------------------------------------------------------------
  // Classification pass
  // ---------------------------------------------------------------------------

  function classify(lines, ctx) {
    const out = [];
    let pyMode = false;       // inside a Python traceback
    let pyAfterFrame = false; // next indented lines are source code
    let nodeSrc = false;      // inside a Node "file.js:88 / source / ^" header

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      let m;

      // Node uncaught-exception source header
      if ((m = RE.nodeLocHeader.exec(raw))) {
        const pub = isPublicJsLocation(m[1]);
        out.push({ type: 'trace', raw, text: (pub ? shortenPublicPath(m[1]) : aliasJsLocation(m[1], ctx)) + ':' + m[2] });
        nodeSrc = !pub;
        continue;
      }
      if (nodeSrc) {
        if (raw.trim() === '') { nodeSrc = false; out.push({ type: 'trace', raw, text: '' }); continue; }
        if (!RE.simpleErr.test(raw) && !RE.excHeader.test(raw)) {
          if (ctx.o.hidePrivateSource) {
            if (!RE.pyCaret.test(raw)) { ctx.stats.sourceHidden++; out.push({ type: 'trace', raw, text: '    <source hidden>' }); }
            else out.push({ type: 'drop', raw });
          } else out.push({ type: 'trace', raw, text: raw, sanitize: true });
          continue;
        }
        nodeSrc = false;
      }

      if (RE.pyTraceback.test(raw)) { pyMode = true; pyAfterFrame = false; out.push({ type: 'header', raw, text: raw.trimEnd() }); continue; }
      if (RE.pyChain.test(raw)) { out.push({ type: 'trace', raw, text: raw.trim() }); continue; }

      if (pyMode && (m = RE.pyFrame.exec(raw))) {
        const r = rewritePyFrame(m, ctx);
        out.push({ type: 'frame', raw, text: r.text, kind: r.kind, group: r.group, lang: r.lang });
        r.kind === 'private' ? ctx.stats.privateFrames++ : ctx.stats.publicFrames++;
        pyAfterFrame = r.kind;
        continue;
      }
      if (pyMode && pyAfterFrame && /^\s{4,}\S/.test(raw) && !RE.pyFrame.test(raw)) {
        if (RE.pyCaret.test(raw)) { out.push({ type: 'drop', raw }); continue; }
        if (pyAfterFrame === 'private' && ctx.o.hidePrivateSource) {
          ctx.stats.sourceHidden++;
          out.push({ type: 'frame-src', raw, text: raw.match(/^\s*/)[0] + '<source hidden>', kind: 'private' });
        } else {
          out.push({ type: 'frame-src', raw, text: raw.trimEnd(), kind: pyAfterFrame, sanitize: pyAfterFrame === 'private' });
        }
        continue;
      }
      if (pyMode && /^\s*\.\.\.\s*$/.test(raw)) { out.push({ type: 'trace', raw, text: raw.trimEnd() }); continue; }
      if (pyMode && /^\s*\[Previous line repeated \d+ more times\]\s*$/.test(raw)) { out.push({ type: 'trace', raw, text: raw.trimEnd() }); continue; }

      // Python final exception line (non-indented, after frames)
      if (pyMode && /^[A-Za-z_][\w.]*(?::|$)/.test(raw) && !/^\s/.test(raw)) {
        const em = /^([A-Za-z_][\w.]*)(?:(:\s?)(.*))?$/.exec(raw);
        if (em) {
          out.push({ type: 'header', raw, text: rewriteExcName(em[1], ctx) + (em[2] ? em[2] : ''), msg: em[3] || '' });
          pyMode = false; pyAfterFrame = false;
          continue;
        }
      }

      // JVM: java frame vs .NET frame
      if ((m = RE.javaFrame.exec(raw)) && RE.javaLoc.test(m[5])) {
        const r = rewriteJavaFrame(m, ctx);
        out.push({ type: 'frame', raw, text: r.text, kind: r.kind, group: r.group, lang: r.lang });
        r.kind === 'private' ? ctx.stats.privateFrames++ : ctx.stats.publicFrames++;
        continue;
      }
      if ((m = RE.jsFrame.exec(raw)) && /[/\\]|^node:|^internal\/|\.(?:m?[jt]sx?|cjs|vue|svelte)$/.test(m[4])) {
        const r = rewriteJsFrame(m, ctx);
        out.push({ type: 'frame', raw, text: r.text, kind: r.kind, group: r.group, lang: r.lang });
        r.kind === 'private' ? ctx.stats.privateFrames++ : ctx.stats.publicFrames++;
        continue;
      }
      if ((m = RE.jsFrameNoLoc.exec(raw))) {
        out.push({ type: 'frame', raw, text: raw.trimEnd(), kind: 'public', group: 'native' });
        ctx.stats.publicFrames++;
        continue;
      }
      if ((m = RE.dotnetFrame.exec(raw)) && /^[\w.`+<>|]+$/.test(m[2])) {
        const r = rewriteDotnetFrame(m, ctx);
        out.push({ type: 'frame', raw, text: r.text, kind: r.kind, group: r.group, lang: r.lang });
        r.kind === 'private' ? ctx.stats.privateFrames++ : ctx.stats.publicFrames++;
        continue;
      }
      if ((m = RE.ffFrame.exec(raw)) && /[/\\.]/.test(m[3])) {
        const loc = m[3];
        const pub = isPublicJsLocation(loc) && !ctx.isForcedPrivate(loc);
        const fn = m[2];
        const text = m[1] + (pub ? fn : (fn ? aliasJsFunction(fn.replace(/[/<]+$/, ''), ctx) : '')) + '@' + (pub ? shortenPublicPath(loc) : aliasJsLocation(loc, ctx)) + ':' + m[4] + ':' + m[5];
        out.push({ type: 'frame', raw, text, kind: pub ? 'public' : 'private', group: pub ? 'vendor' : undefined, lang: 'js' });
        pub ? ctx.stats.publicFrames++ : ctx.stats.privateFrames++;
        continue;
      }
      if (RE.javaMore.test(raw)) { out.push({ type: 'trace', raw, text: raw.trimEnd() }); continue; }
      if (/^\s*---\s*End of (?:inner exception )?stack trace.*---\s*$/.test(raw)) { out.push({ type: 'trace', raw, text: raw.trimEnd() }); continue; }

      // Exception headers
      if ((m = RE.excHeader.exec(raw))) {
        out.push({ type: 'header', raw, text: m[1] + m[2] + rewriteExcName(m[3], ctx) + (m[4] || ''), msg: m[5] || '' });
        continue;
      }
      if ((m = RE.simpleErr.exec(raw))) {
        out.push({ type: 'header', raw, text: m[1] + m[2] + rewriteExcName(m[3], ctx) + (m[4] || '') + (m[5] || ''), msg: m[6] || '' });
        continue;
      }
      // " ---> Acme.Billing.TierCapException: msg" (.NET inner exception)
      if ((m = /^(\s*--->\s*)((?:[A-Za-z_][\w]*\.)+[A-Z]\w*)(:\s?)(.*)$/.exec(raw))) {
        out.push({ type: 'header', raw, text: m[1] + rewriteExcName(m[2], ctx) + m[3], msg: m[4] });
        continue;
      }
      // JS bare frame "at async Promise.all (index 0)" handled above; "at Generator.next (<anonymous>)" too.
      if (RE.jsFrameBare.test(raw) && /^\s+at\s/.test(raw) && !/[/\\]/.test(raw) && out.length && out[out.length - 1].type === 'frame') {
        out.push({ type: 'frame', raw, text: raw.trimEnd(), kind: 'public', group: 'native' });
        continue;
      }

      if (raw.trim() === '') { out.push({ type: 'blank', raw }); continue; }
      out.push({ type: 'log', raw, isError: RE.logLevel.test(raw) || RE.termError.test(raw), isWarn: RE.warnLevel.test(raw), isPrompt: isPromptLine(raw) });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Selection pass — keep the failure, drop the noise
  // ---------------------------------------------------------------------------

  function select(items, ctx) {
    if (ctx.o.noCut) {
      // keep every line; only the ^^^ markers under a hidden source line go (they point at nothing now)
      return items.map((it, i) => it.type !== 'drop' || !(items[i - 1] && /<source hidden>/.test(items[i - 1].text || '')));
    }
    const isTrace = (it) => it && (it.type === 'frame' || it.type === 'frame-src' || it.type === 'header' || it.type === 'trace');
    const hasTrace = items.some((it) => it.type === 'frame' || it.type === 'header');
    const keep = new Array(items.length).fill(false);

    if (!hasTrace && items.some((it) => it.isPrompt)) {
      // Terminal session: the output is the point. Keep every command and its output,
      // trimming only very long outputs to their start and end (errors in the middle stay).
      const HEAD = 25, TAIL = 15;
      let i = 0;
      while (i < items.length) {
        let j = i + 1;
        while (j < items.length && !items[j].isPrompt) j++;
        const out = j - i - 1;
        for (let k = i; k < j; k++) {
          const pos = k - i - 1;
          keep[k] = items[k].type !== 'drop' && (out <= HEAD + TAIL + 5 || pos < HEAD || pos >= out - TAIL || items[k].isError);
        }
        i = j;
      }
      return keep;
    }

    if (!hasTrace) {
      // No stack trace — keep error lines + a little context, or everything if short.
      const errIdx = items.map((it, i) => (it.isError || it.isPrompt) ? i : -1).filter((i) => i >= 0);
      if (!errIdx.length || items.length <= 40) return items.map((it) => it.type !== 'drop');
      for (const i of errIdx) {
        for (let j = Math.max(0, i - 2); j <= Math.min(items.length - 1, i + 1); j++) keep[j] = true;
        for (let j = i - 1; j >= 0 && j >= i - 400; j--) if (items[j].type === 'log' && SECTION_RE.test(items[j].raw)) { keep[j] = true; break; }
      }
      return keep;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type === 'drop') continue;
      if (isTrace(it)) {
        keep[i] = true;
        // blank lines inside a trace (python chained exceptions)
        continue;
      }
      if (it.type === 'log' && (it.isError || it.isPrompt)) keep[i] = true;
    }
    const prevReal = (i) => { let j = i - 1; while (j >= 0 && items[j].type === 'drop') j--; return items[j]; };
    // context before each trace block (repeated lines don't use up the budget)
    for (let i = 0; i < items.length; i++) {
      if (isTrace(items[i]) && !isTrace(prevReal(i))) {
        let n = 0, last = null;
        for (let j = i - 1; j >= 0 && n < ctx.o.contextLines; j--) {
          if (items[j].type === 'blank' || items[j].type === 'drop') continue;
          if (isTrace(items[j])) break;
          keep[j] = true;
          const k = normLog(items[j].raw);
          if (k !== last) n++;
          last = k;
        }
      }
    }
    // the last few distinct warnings before the first trace are often the clue
    const firstTrace = items.findIndex((it) => it.type === 'frame' || it.type === 'header');
    const seenWarn = new Set();
    for (let i = firstTrace - 1; i >= 0 && seenWarn.size < ctx.o.maxWarnings; i--) {
      if (items[i].type === 'log' && items[i].isWarn) {
        const k = normLog(items[i].raw).replace(/\d+/g, '#');
        if (!seenWarn.has(k)) { seenWarn.add(k); keep[i] = true; }
      }
    }
    // the task / step a failure belongs to (Ansible TASK [...], CI step, Gradle task, build step)
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const start = (it.type === 'header' || it.type === 'frame') && !isTrace(prevReal(i));
      if (!start && !(it.type === 'log' && it.isError)) continue;
      for (let j = i - 1; j >= 0 && j >= i - 400; j--) {
        if (items[j].type === 'log' && SECTION_RE.test(items[j].raw)) { keep[j] = true; break; }
      }
    }
    // runtime version footers help the AI
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'log' && /^\s*(?:Node\.js v\d|Python \d\.\d|openjdk version|java version|\.NET (?:SDK|Runtime))/.test(items[i].raw)) keep[i] = true;
    }
    // keep blank lines that sit between two kept trace parts (python "During handling…")
    for (let i = 1; i < items.length - 1; i++) {
      if (items[i].type === 'blank' && keep[i - 1] && isTrace(items[i - 1])) {
        let j = i + 1; while (j < items.length && items[j].type === 'blank') j++;
        if (j < items.length && isTrace(items[j])) keep[i] = true;
      }
    }
    return keep;
  }

  // The same exception logged 25 times: keep the first, note the rest.
  function collapseRepeatedTraces(lines) {
    const isT = (l) => l && (l.type === 'header' || l.type === 'frame' || l.type === 'frame-src' || l.type === 'trace');
    const blocks = [];
    for (let i = 0; i < lines.length;) {
      if (lines[i].type === 'header') {
        let j = i + 1;
        while (j < lines.length && (isT(lines[j]) && lines[j].type !== 'header' || (lines[j].type === 'header' && /^\s*(?:Caused by|Suppressed|--->)/.test(lines[j].text)))) j++;
        blocks.push([i, j]); i = j;
      } else i++;
    }
    const key = (a, b) => lines.slice(a, b).map((l) => l.text.replace(/\d{2}:\d{2}:\d{2}[.,]?\d*/g, '')).join('\n');
    const seen = new Map();
    const drop = new Set();
    const counts = new Map();
    for (const [a, b] of blocks) {
      const k = key(a, b);
      if (seen.has(k)) {
        for (let x = a; x < b; x++) drop.add(x);
        counts.set(seen.get(k), (counts.get(seen.get(k)) || 0) + 1);
      } else seen.set(k, b - 1);
    }
    if (!drop.size) return lines;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (drop.has(i)) continue;
      out.push(lines[i]);
      if (counts.has(i)) out.push({ type: 'trace', text: '[same stack trace repeated ' + counts.get(i) + ' more time' + (counts.get(i) === 1 ? '' : 's') + ']' });
    }
    // context lines left between collapsed copies are usually the same few lines again
    const res = [];
    const seenCtx = new Set();
    for (const l of out) {
      if (l.type === 'log' && !l.isErrorLine) {
        const k = normLog(l.text).replace(/\d+/g, '#');
        if (seenCtx.has(k)) continue;
        seenCtx.add(k);
      }
      if (l.type === 'gap' && res.length && res[res.length - 1].type === 'gap') {
        const n = (x) => +((/[\d,]+/.exec(x.text) || ['0'])[0].replace(/,/g, ''));
        const total = n(res[res.length - 1]) + n(l);
        res[res.length - 1] = { type: 'gap', text: '[… ' + total.toLocaleString('en-US') + ' log lines omitted …]' };
        continue;
      }
      res.push(l);
    }
    return res;
  }

  function collapsePublicRuns(lines, ctx) {
    // lines: [{text, kind, group, type}]
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.type === 'frame' && l.kind === 'public') {
        let j = i;
        while (j < lines.length && lines[j].type === 'frame' && lines[j].kind === 'public') j++;
        const run = lines.slice(i, j);
        if (run.length > ctx.o.maxPublicRun) {
          const head = run.slice(0, ctx.o.keepPublicHead);
          const tail = run.slice(run.length - 1);
          const hidden = run.slice(ctx.o.keepPublicHead, run.length - 1);
          const groups = [...new Set(hidden.map((h) => h.group).filter(Boolean))].slice(0, 3);
          const indent = (hidden[0].text.match(/^\s*/) || [''])[0];
          out.push(...head);
          out.push({ type: 'trace', text: indent + '... ' + hidden.length + ' framework frames omitted' + (groups.length ? ' (' + groups.join(', ') + ')' : '') });
          out.push(...tail);
          ctx.stats.collapsedFrames += hidden.length;
        } else out.push(...run);
        i = j;
      } else { out.push(l); i++; }
    }
    return out;
  }

  function dedupe(lines) {
    // collapse consecutive identical lines (ignoring leading timestamps)
    const norm = normLog;
    const out = [];
    for (const l of lines) {
      const prev = out[out.length - 1];
      if (prev && l.type === 'log' && prev.type === 'log' && norm(prev.text) === norm(l.text)) {
        prev.repeat = (prev.repeat || 1) + 1;
        continue;
      }
      out.push(Object.assign({}, l));
    }
    return out.map((l) => l.repeat ? Object.assign(l, { text: l.text + '   [×' + l.repeat + ']' }) : l);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Strip a pasted log / stack trace.
   * @param {string} input
   * @param {object} [opts]   see DEFAULTS
   * @param {object} [table]  alias table to extend (mutated); a fresh one is created when omitted
   * @returns {{ text: string, table: object, report: object, changed: boolean }}
   */
  function strip(input, opts, table) {
    table = table || createAliasTable();
    const before = aliasCount(table);
    const ctx = makeCtx(opts, table);
    KEEP = new Set((ctx.o.keepVisible || []).map((k) => String(k).trim()).filter(Boolean));

    const normalized = String(input || '').replace(/\r\n?/g, '\n');
    if (!ctx.o.noCut && !looksLikeLog(normalized)) ctx.o.noCut = true;
    const secretsFree = redactSecrets(normalized, ctx);
    learnIdentity(secretsFree, ctx);
    learnDomains(secretsFree, ctx);
    learnKeyed(secretsFree, ctx);
    const lines = secretsFree.split('\n');
    const items = classify(lines, ctx);
    const keep = select(items, ctx);

    let kept = [];
    let dropped = 0;
    let lastKept = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!keep[i]) { if (it.type !== 'blank' && it.type !== 'drop') dropped++; continue; }
      if (i - lastKept > 1) {
        const gap = items.slice(Math.max(0, lastKept + 1), i).filter((x) => x.type === 'log').length;
        if (gap > 0) kept.push({ type: 'gap', text: '[… ' + gap + ' log line' + (gap === 1 ? '' : 's') + ' omitted …]' });
      }
      lastKept = i;
      if (it.type === 'log') kept.push({ type: 'log', text: it.raw });
      else if (it.type === 'blank') kept.push({ type: 'blank', text: '' });
      else if (it.type === 'header') kept.push({ type: 'header', text: it.text, msg: it.msg });
      else kept.push({ type: it.type, text: it.text !== undefined ? it.text : it.raw, kind: it.kind, group: it.group, sanitize: it.sanitize });
    }

    if (!ctx.o.noCut) {
      kept = collapseRepeatedTraces(kept);
      kept = collapsePublicRuns(kept, ctx);
    }

    learnWords(ctx);
    // Second pass: sanitise free text now that the alias table knows every private name.
    kept = kept.map((l) => {
      if (l.type === 'log' && /^\s*\{.*\}\s*$/.test(l.text)) {
        const j = sanitizeJsonLine(l.text, ctx);
        if (j !== null) return Object.assign(l, { text: j });
      }
      if (l.type === 'log' || l.sanitize) return Object.assign(l, { text: sanitizeText(l.text, ctx) });
      if (l.type === 'header') return Object.assign(l, { text: l.text + (l.msg ? sanitizeText(l.msg, ctx, { quotes: true }) : '') });
      if (l.type === 'frame' || l.type === 'trace') return Object.assign(l, { text: replacePrivateTerms(l.text, ctx) });
      return l;
    });
    kept = kept.map((l) => Object.assign(l, { text: hideIdentity(l.text, ctx) }));
    if (!ctx.o.noCut) kept = dedupe(kept);

    // trim leading / trailing blanks
    while (kept.length && kept[0].type === 'blank') kept.shift();
    while (kept.length && kept[kept.length - 1].type === 'blank') kept.pop();

    const text = kept.map((l) => l.text).join('\n');
    ctx.stats.newAliases = aliasCount(table) - before;

    // which aliases actually appear in the output
    const used = { identity: 0, names: 0 };
    for (const key of Object.keys(table.forward)) {
      const alias = table.forward[key];
      const kind = key.slice(0, key.indexOf('\u0000'));
      if (!new RegExp('(?<![\\w])' + escapeRe(alias) + '(?![\\w])').test(text)) continue;
      if (kind === 'user' || kind === 'machine' || kind === 'person' || kind === 'dir') used.identity++;
      else used.names++;
    }

    const report = Object.assign({}, ctx.stats, {
      replacements: listReplacements(text, table),
      secretList: groupSecrets(ctx.secretsFound),
      identityHidden: used.identity,
      namesHidden: used.names,
      linesIn: normalized.split('\n').length,
      linesOut: kept.length,
      linesDropped: dropped,
      tokensIn: estTokens(normalized),
      tokensOut: estTokens(text),
      languages: [...new Set(items.map((x) => x.lang).filter(Boolean))],
      hasTrace: items.some((x) => x.type === 'frame' || x.type === 'header'),
    });
    return { text, table, report, changed: text.replace(/\s+$/, '') !== normalized.replace(/\s+$/, '') };
  }

  const KIND_LABEL = {
    user: 'Username', machine: 'Machine name', person: 'Person', dir: 'Project folder', branch: 'Git branch',
    domain: 'Domain', word: 'Company / project word', service: 'Service / workload', bucket: 'Storage bucket', host: 'Hostname', ip: 'IP address', email: 'Email', path: 'File path', srcfile: 'Source file',
    pyfile: 'Source file', jsfile: 'Source file', csfile: 'Source file', pkg: 'Package', ns: 'Namespace', cls: 'Class',
    exc: 'Exception', method: 'Method', func: 'Function', str: 'Quoted value', id: 'Business ID', uuid: 'UUID', term: 'Hidden word',
  };
  const KIND_ORDER = Object.keys(KIND_LABEL);

  /** Every original → stand-in that appears in this output, with how often. */
  function listReplacements(text, table) {
    const out = [];
    for (const key of Object.keys(table.forward)) {
      const i = key.indexOf('\u0000');
      const kind = key.slice(0, i);
      const alias = table.forward[key];
      const n = (text.match(new RegExp('(?<![\\w])' + escapeRe(alias) + '(?![\\w])', 'g')) || []).length;
      if (!n) continue;
      out.push({ kind, label: KIND_LABEL[kind] || kind, original: key.slice(i + 1), alias, count: n });
    }
    return out.sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || (b.count - a.count));
  }

  function groupSecrets(list) {
    const by = new Map();
    for (const s of list) {
      if (!by.has(s.type)) by.set(s.type, { type: s.type, count: 0, hints: [] });
      const g = by.get(s.type);
      g.count++;
      if (g.hints.length < 3 && !g.hints.includes(s.hint)) g.hints.push(s.hint);
    }
    return [...by.values()].sort((a, b) => b.count - a.count);
  }

  /** Does the text contain a name StackStrip already learned is private (in an earlier paste)? */
  function containsKnown(text, table) {
    if (!text || !table || !table.forward) return false;
    const low = text.toLowerCase();
    for (const key of Object.keys(table.forward)) {
      const i = key.indexOf('\u0000');
      const kind = key.slice(0, i), orig = key.slice(i + 1);
      if (orig.length < 5 || ['str', 'uuid', 'id', 'method', 'func'].includes(kind)) continue;
      if ((kind === 'cls' || kind === 'exc') && !/[a-z][A-Z]/.test(orig)) continue;
      if (low.includes(orig.toLowerCase())) return true;
    }
    return false;
  }

  /** Quick check used by the extension to decide whether to intercept a paste. */
  function looksLikeLog(text, table) {
    if (!text) return false;
    if (table && containsKnown(text, table)) return true;
    if (text.length < 40) return false;
    KEYED.lastIndex = 0;
    let km;
    while ((km = KEYED.exec(text))) {
      if (/^(?:pod|container|namespace|bucket|endpoint|server_addr|hostname|fqdn|deployment|statefulset|node|product|customer|company|serial_number|serial|asset_tag|cluster|tenant|account)$/i.test(km[2])) return true;
    }
    const exc = text.match(/(?<![\w.$\/-])[A-Z][A-Za-z0-9]*?[a-z0-9](?:Exception|Error)(?![\w$])/g) || [];
    if (exc.some((x) => !PUBLIC_ERRORS.has(x) && !COMMON_BARE_EXC.has(x))) return true;
    const lines = text.split(/\r?\n/);
    let frames = 0, levels = 0;
    for (const l of lines.slice(0, 4000)) {
      if (/^\s+at\s+\S+\(.*\)\s*$|^\s+at\s+.+:\d+:\d+\)?\s*$|^\s*File ".+", line \d+|^\s*Traceback \(most recent call last\)|^\S*@\S+:\d+:\d+$/.test(l)) frames++;
      if (RE.anyLevel.test(l) && /\d{2}:\d{2}:\d{2}/.test(l)) levels++;
      if (RE.excHeader.test(l)) frames++;
    }
    if (frames >= 1) return true;
    if (levels >= 3) return true;
    if (lines.length >= 2 && lines.some((l) => isPromptLine(l))) return true;
    if (lines.some((l) => RE.termError.test(l)) && (lines.length >= 2 || /(?:\/Users\/|\/home\/|[A-Za-z]:\\)/.test(text))) return true;
    if (/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[A-Za-z0-9_]/.test(text) && lines.length >= 2) return true;
    for (const [, re] of SECRET_RULES) { re.lastIndex = 0; if (re.test(text)) return true; }
    return false;
  }

  /** Clean a short string (e.g. a file name) using only names already learned in the alias table. */
  function hideNames(text, opts, table) {
    const ctx = makeCtx(opts, table || createAliasTable());
    KEEP = new Set((ctx.o.keepVisible || []).map((k) => String(k).trim()).filter(Boolean));
    return replacePrivateTerms(hideIdentity(String(text || ''), ctx), ctx);
  }

  /** Put the original names back into text that came from the AI. Secrets are never restored. */
  function restore(text, table) {
    if (!text || !table || !table.forward) return { text, count: 0 };
    const pairs = [];
    for (const key of Object.keys(table.forward)) {
      const orig = key.slice(key.indexOf('\u0000') + 1);
      const kind = key.slice(0, key.indexOf('\u0000'));
      pairs.push([table.forward[key], orig, kind]);
    }
    pairs.sort((a, b) => b[0].length - a[0].length);
    let count = 0;
    let t = text;
    // single pass with one combined regex so restored text is never re-processed
    if (!pairs.length) return { text, count };
    const byAlias = new Map(pairs.map((p) => [p[0], p[1]]));
    const re = new RegExp('(?<![\\w$])(?:' + pairs.map((p) => escapeRe(p[0])).join('|') + ')(?![\\w$])', 'g');
    t = t.replace(re, (m) => { count++; return byAlias.get(m); });
    return { text: t, count };
  }

  return { strip, restore, looksLikeLog, containsKnown, hideNames, createAliasTable, aliasCount, DEFAULTS, version: '0.4.1' };
});
