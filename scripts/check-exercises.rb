#!/usr/bin/env ruby
# Runs every Ruby exercise's declared tests against its declared solution, and
# checks that the starter does NOT already pass them all.
#
# Why both halves: a suite the solution fails is a broken exercise, and a suite
# the starter already passes is an exercise that asks for nothing. The second
# check has caught more real problems than the first.
#
# Comparison mirrors the browser runner, which serialises the value with JSON
# and compares structurally (see src/runners/ruby-worker.ts). Using `inspect`
# here would be stricter than production and would reject a Symbol the real
# grader accepts, since JSON turns :a into "a".
require 'yaml'
require 'json'

def probe(setup, tests)
  calls = tests.map.with_index do |t, i|
    "results[#{i}] = begin; JSON.generate([(#{t['call']})]); " \
      "rescue Exception => e; \"RAISED \#{e.class}\"; end"
  end
  script = <<~RB
    require 'json'
    require 'set'
    #{setup}
    results = Array.new(#{tests.size}, 'NOT RUN')
    #{calls.join("\n")}
    $stdout.write(results.join("\\u0000"))
  RB
  out = IO.popen(['ruby', '-e', script], err: %i[child out], &:read)
  [$?.success?, out]
end

files = Dir.glob('content/**/exercise.yml').sort
ruby_files = files.select { |f| YAML.load_file(f)['language'] == 'ruby' }
total = 0
bad = []

ruby_files.each do |file|
  ex = YAML.load_file(file)
  label = file.sub('content/', '').sub('/exercise.yml', '')
  tests = ex['tests'] || []
  next if tests.empty?

  total += tests.size

  ok, out = probe(ex['solution'], tests)
  unless ok
    bad << [label, 'solution did not run', out.lines.first(3).join.strip]
    next
  end

  got = out.split("\u0000", -1)
  failures = tests.each_with_index.filter_map do |t, i|
    want = JSON.generate([t['expect']])
    "#{t['id']} → got #{got[i]}, want #{want}" unless got[i] == want
  end
  bad << [label, "#{failures.size}/#{tests.size} fail against the solution", failures.first(3).join('; ')] if failures.any?

  # The starter should NOT pass everything.
  starter = ex['starter'].to_s.split(/^# Scratch space/).first
  s_ok, s_out = probe(starter, tests)
  if s_ok
    s_got = s_out.split("\u0000", -1)
    passing = tests.each_with_index.count { |t, i| s_got[i] == JSON.generate([t['expect']]) }
    bad << [label, 'the STARTER passes every test', 'the exercise asks for nothing'] if passing == tests.size
  end
end

if bad.empty?
  puts "✔ #{ruby_files.size} ruby exercises, #{total} tests, all pass against their solutions"
else
  bad.each { |label, what, detail| warn "✘ #{label}: #{what}\n    #{detail}" }
  exit 1
end
