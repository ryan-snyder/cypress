e2e = require("../support/helpers/e2e")
_ = require('lodash')

describe "e2e commands outside of test", ->
  e2e.setup()

  _.each [
    'chrome',
    'electron'
  ], (browser) ->

    it "[#{browser}] fails on cy commands", ->
      e2e.exec(@, {
        spec: "commands_outside_of_test_spec.coffee"
        snapshot: true
        expectedExitCode: 1
        browser
      })

    it "[#{browser}] fails on failing assertions", ->
      e2e.exec(@, {
        spec: "assertions_failing_outside_of_test_spec.coffee"
        snapshot: true
        expectedExitCode: 1
        browser
      })

  it "passes on passing assertions", ->
    e2e.exec(@, {
      spec: "assertions_passing_outside_of_test_spec.coffee"
      snapshot: true
      expectedExitCode: 0
    })
