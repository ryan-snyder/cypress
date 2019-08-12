const _ = require('lodash')
const Promise = require('bluebird')

const $dom = require('../../../dom')
const $elements = require('../../../dom/elements')
const $selection = require('../../../dom/selection')
const $utils = require('../../../cypress/utils')
const $actionability = require('../../actionability')
const Debug = require('debug')
const debug = Debug('cypress:driver:command:type')

// const dateRegex = /^\d{4}-\d{2}-\d{2}/
// const monthRegex = /^\d{4}-(0\d|1[0-2])/
// const weekRegex = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])/
// const timeRegex = /^([0-1]\d|2[0-3]):[0-5]\d(:[0-5]\d)?(\.[0-9]{1,3})?/
// const dateTimeRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/

module.exports = function (Commands, Cypress, cy, state, config) {
  const { keyboard } = cy.internal
  const { Keyboard } = Cypress

  function type (subject, chars, options = {}) {
    // debugger
    //
    debug('type:', chars)
    let updateTable

    options = _.clone(options)
    //# allow the el we're typing into to be
    //# changed by options -- used by cy.clear()
    _.defaults(options, {
      $el: subject,
      log: true,
      verify: true,
      force: false,
      parseSpecialCharSequences: true,
      delay: 10,
      release: true,
      waitForAnimations: config('waitForAnimations'),
      animationDistanceThreshold: config('animationDistanceThreshold'),
    })

    if (options.log) {
      //# figure out the options which actually change the behavior of clicks
      const deltaOptions = $utils.filterOutOptions(options)

      const table = {}

      const getRow = (id, key, which) => {
        return table[id] || (function () {
          let obj

          table[id] = (obj = {})
          const modifiers = Keyboard.modifiersToString(Keyboard.getActiveModifiers(state))

          if (modifiers) {
            obj.modifiers = modifiers
          }

          if (key) {
            obj.typed = key
            if (which) {
              obj.which = which
            }
          }

          return obj
        })()
      }

      updateTable = function (id, key, column, which, value) {
        const row = getRow(id, key, which)

        row[column] = value || 'preventedDefault'
      }

      //# transform table object into object with zero based index as keys
      const getTableData = () => {
        return _.reduce(_.values(table), (memo, value, index) => {
          memo[index + 1] = value

          return memo
        }
        , {})
      }

      options._log = Cypress.log({
        message: [chars, deltaOptions],
        $el: options.$el,
        consoleProps () {
          return {
            'Typed': chars,
            'Applied To': $dom.getElements(options.$el),
            'Options': deltaOptions,
            'table': {
              //# mouse events tables will take up slots 1 and 2 if they're present
              //# this preserves the order of the tables
              3: () => {
                return {
                  name: 'Keyboard Events',
                  data: getTableData(),
                  columns: ['typed', 'which', 'keydown', 'keypress', 'textInput', 'input', 'keyup', 'change', 'modifiers'],
                }
              },
            },
          }
        },
      })

      options._log.snapshot('before', { next: 'after' })
    }

    // const verifyElementForType = ($el) => {
    //   const el = $el.get(0)
    //   const isTextLike = $dom.isTextLike(el)

    //   const isFocusable = $elements.isFocusable($el)

    //   if (!isFocusable && !isTextLike) {
    //     const node = $dom.stringify($el)

    //     $utils.throwErrByPath('type.not_on_typeable_element', {
    //       args: { node },
    //     })
    //   }

    //   if (!isFocusable && isTextLike) {
    //     const node = $dom.stringify($el)

    //     $utils.throwErrByPath('type.not_actionable_textlike', {
    //       args: { node },
    //     })
    //   }
    // }

    // verifyElementForType(el)

    if (options.$el.length > 1) {

      $utils.throwErrByPath('type.multiple_elements', {
        onFail: options._log,
        args: { num: options.$el.length },
      })
    }

    if (!(_.isString(chars) || _.isFinite(chars))) {
      $utils.throwErrByPath('type.wrong_type', {
        onFail: options._log,
        args: { chars },
      })
    }

    chars = `${chars}`

    // _setCharsNeedingType(nextChars)

    // options.chars = `${charsToType}`

    const win = state('window')

    const getDefaultButtons = (form) => {
      return form.find('input, button').filter((__, el) => {
        const $el = $dom.wrap(el)

        return (
          ($dom.isSelector($el, 'input') && $dom.isType($el, 'submit')) ||
          ($dom.isSelector($el, 'button') && !$dom.isType($el, 'button') && !$dom.isType($el, 'reset'))
        )
      })
    }

    const type = function () {
      const simulateSubmitHandler = function () {
        const form = options.$el.parents('form')

        if (!form.length) {
          return
        }

        const multipleInputsAllowImplicitSubmissionAndNoSubmitElements = function (form) {
          const submits = getDefaultButtons(form)

          // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission
          // some types of inputs can submit the form when hitting {enter}
          // but only if they are the sole input that allows implicit submission
          // and there are no buttons or input[submits] in the form
          const implicitSubmissionInputs = form.find('input').filter((__, input) => {
            const $input = $dom.wrap(input)

            return $elements.isInputAllowingImplicitFormSubmission($input)
          })

          return (implicitSubmissionInputs.length > 1) && (submits.length === 0)
        }

        // throw an error here if there are multiple form parents

        // bail if we have multiple inputs allowing implicit submission and no submit elements
        if (multipleInputsAllowImplicitSubmissionAndNoSubmitElements(form)) {
          return
        }

        const clickedDefaultButton = function (button) {
          // find the 'default button' as per HTML spec and click it natively
          // do not issue mousedown / mouseup since this is supposed to be synthentic
          if (button.length) {
            button.get(0).click()

            return true
          }

          return false

        }

        const getDefaultButton = (form) => {
          return getDefaultButtons(form).first()
        }

        const defaultButtonisDisabled = (button) => {
          return button.prop('disabled')
        }

        const defaultButton = getDefaultButton(form)

        //# bail if the default button is in a 'disabled' state
        if (defaultButtonisDisabled(defaultButton)) {
          return
        }

        //# issue the click event to the 'default button' of the form
        //# we need this to be synchronous so not going through our
        //# own click command
        //# as of now, at least in Chrome, causing the click event
        //# on the button will indeed trigger the form submit event
        //# so we dont need to fire it manually anymore!
        if (!clickedDefaultButton(defaultButton)) {
          //# if we werent able to click the default button
          //# then synchronously fire the submit event
          //# currently this is sync but if we use a waterfall
          //# promise in the submit command it will break again
          //# consider changing type to a Promise and juggle logging
          return cy.now('submit', form, { log: false, $el: form })
        }
      }

      const dispatchChangeEvent = function (el, id) {
        const change = document.createEvent('HTMLEvents')

        change.initEvent('change', true, false)

        const dispatched = el.dispatchEvent(change)

        if (id && updateTable) {
          return updateTable(id, null, 'change', null, dispatched)
        }
      }

      const needSingleValueChange = (el) => {
        return $elements.isNeedSingleValueChangeInputElement(el)
      }

      //# see comment in updateValue below
      let typed = ''

      const isContentEditable = $elements.isContentEditable(options.$el.get(0))
      const isTextarea = $elements.isTextarea(options.$el.get(0))

      return keyboard.type({
        $el: options.$el,
        chars,
        delay: options.delay,
        release: options.release,
        parseSpecialCharSequences: options.parseSpecialCharSequences,
        window: win,
        force: options.force,
        simulated: options.simulated,
        onFail: options._log,

        updateValue (el, key, charsToType) {
          // in these cases, the value must only be set after all
          // the characters are input because attemping to set
          // a partial/invalid value results in the value being
          // set to an empty string
          if (needSingleValueChange(el)) {
            typed += key
            if (typed === charsToType) {
              return $elements.setNativeProp(el, 'value', charsToType)
            }
          } else {
            return $selection.replaceSelectionContents(el, key)
          }
        },

        // onFocusChange (el, chars) {
        //   const lastIndexToType = validateTyping(el, chars)
        //   const [charsToType, nextChars] = _splitChars(
        //     `${chars}`,
        //     lastIndexToType
        //   )

        //   _setCharsNeedingType(nextChars)

        //   return charsToType
        // },

        onAfterType () {
          if (options.release === true) {
            state('keyboardModifiers', null)
          }
          // if (charsNeedingType) {
          //   const lastIndexToType = validateTyping(el, charsNeedingType)
          //   const [charsToType, nextChars] = _splitChars(
          //     charsNeedingType,
          //     lastIndexToType
          //   )

          //   _setCharsNeedingType(nextChars)

          //   return charsToType
          // }

          // return false
        },

        onBeforeType (totalKeys) {
          //# for the total number of keys we're about to
          //# type, ensure we raise the timeout to account
          //# for the delay being added to each keystroke
          return cy.timeout(totalKeys * options.delay, true, 'type')
        },

        onBeforeSpecialCharAction (id, key) {
          //# don't apply any special char actions such as
          //# inserting new lines on {enter} or moving the
          //# caret / range on left or right movements
          // if (isTypeableButNotAnInput) {
          //   return false
          // }
        },

        // onBeforeEvent (id, key, column, which) {
        //   //# if we are an element which isnt text like but we have
        //   //# a tabindex then it can receive keyboard events but
        //   //# should not fire input or textInput and should not fire
        //   //# change events
        //   if (inputEvents.includes(column) && isTypeableButNotAnInput) {
        //     return false
        //   }
        // },

        onEvent (...args) {
          if (updateTable) {
            return updateTable(...args)
          }
        },

        //# fires only when the 'value'
        //# of input/text/contenteditable
        //# changes
        onValueChange (originalText, el) {
          debug('onValueChange', originalText, el)
          //# contenteditable should never be called here.
          //# only inputs and textareas can have change events
          let changeEvent = state('changeEvent')

          if (changeEvent) {
            if (!changeEvent(null, true)) {
              state('changeEvent', null)
            }

            return
          }

          return state('changeEvent', (id, readOnly) => {
            const changed =
              $elements.getNativeProp(el, 'value') !== originalText

            if (!readOnly) {
              if (changed) {
                dispatchChangeEvent(el, id)
              }

              state('changeEvent', null)
            }

            return changed
          })
        },

        onEnterPressed (id) {
          //# dont dispatch change events or handle
          //# submit event if we've pressed enter into
          //# a textarea or contenteditable
          let changeEvent = state('changeEvent')

          if (isTextarea || isContentEditable) {
            return
          }

          //# if our value has changed since our
          //# element was activated we need to
          //# fire a change event immediately
          if (changeEvent) {
            changeEvent(id)
          }

          //# handle submit event handler here
          return simulateSubmitHandler()
        },

        onNoMatchingSpecialChars (chars, allChars) {
          if (chars === 'tab') {
            return $utils.throwErrByPath('type.tab', { onFail: options._log })
          }

          return $utils.throwErrByPath('type.invalid', {
            onFail: options._log,
            args: { chars: `{${chars}}`, allChars },
          })
        },
      })
    }

    const handleFocused = function () {
      //# if it's the body, don't need to worry about focus
      const isBody = options.$el.is('body')

      if (isBody) {
        return type()
      }

      options.ensure = {
        position: true,
        visibility: true,
        receivability: true,
        notAnimating: true,
        notCovered: true,
        notReadonly: true,
      }

      // if the subject is already the focused element, start typing
      // we handle contenteditable children by getting the host contenteditable,
      // and seeing if that is focused
      // Checking first if element is focusable accounts for focusable els inside
      // of contenteditables
      if ($elements.isFocusedOrInFocused(options.$el.get(0))) {
        debug('element is already focused, only checking readOnly property')
        options.ensure = {
          notReadonly: true,
        }
      }

      return $actionability.verify(cy, options.$el, options, {
        onScroll ($el, type) {
          return Cypress.action('cy:scrolled', $el, type)
        },

        onReady ($elToClick) {
          // if we dont have a focused element
          // or if we do and its not ourselves
          // then issue the click
          if (!$elements.isFocusedOrInFocused($elToClick[0])) {
            //# click the element first to simulate focus
            //# and typical user behavior in case the window
            //# is out of focus
            return cy.now('click', $elToClick, {
              $el: $elToClick,
              log: false,
              verify: false,
              _log: options._log,
              force: true, //# force the click, avoid waiting
              timeout: options.timeout,
              interval: options.interval,
            })
            .then(() => {

              return type()

              // BEOW DOES NOT APPLY
              // cannot just call .focus, since children of contenteditable will not receive cursor
              // with .focus()

            // focusCursor calls focus on first focusable
            // then moves cursor to end if in textarea, input, or contenteditable
              // $selection.focusCursor($elToFocus[0])
            })
          }

          return type()
        },
      })
    }

    return handleFocused().then(() => {
      cy.timeout($actionability.delay, true, 'type')

      return Promise.delay($actionability.delay, 'type').then(() => {
        //# command which consume cy.type may
        //# want to handle verification themselves
        let verifyAssertions

        if (options.verify === false) {
          return options.$el
        }

        return (verifyAssertions = () => {
          return cy.verifyUpcomingAssertions(options.$el, options, {
            onRetry: verifyAssertions,
          })
        })()
      })
    })
  }

  function clear (subject, options = {}) {
    //# what about other types of inputs besides just text?
    //# what about the new HTML5 ones?
    _.defaults(options, {
      log: true,
      force: false,
    })

    //# blow up if any member of the subject
    //# isnt a textarea or text-like
    const clear = function (el) {
      const $el = $dom.wrap(el)

      if (options.log) {
        //# figure out the options which actually change the behavior of clicks
        const deltaOptions = $utils.filterOutOptions(options)

        options._log = Cypress.log({
          message: deltaOptions,
          $el,
          consoleProps () {
            return {
              'Applied To': $dom.getElements($el),
              'Elements': $el.length,
              'Options': deltaOptions,
            }
          },
        })
      }

      const node = $dom.stringify($el)

      if (!$dom.isTextLike($el.get(0))) {
        const word = $utils.plural(subject, 'contains', 'is')

        $utils.throwErrByPath('clear.invalid_element', {
          onFail: options._log,
          args: { word, node },
        })
      }

      return cy
      .now('type', $el, '{selectall}{del}', {
        $el,
        log: false,
        verify: false, //# handle verification ourselves
        _log: options._log,
        force: options.force,
        timeout: options.timeout,
        interval: options.interval,
      })
      .then(() => {
        if (options._log) {
          options._log.snapshot().end()
        }

        return null
      })
    }

    return Promise.resolve(subject.toArray())
    .each(clear)
    .then(() => {
      let verifyAssertions

      return (verifyAssertions = () => {
        return cy.verifyUpcomingAssertions(subject, options, {
          onRetry: verifyAssertions,
        })
      })()
    })
  }

  return Commands.addAll(
    { prevSubject: 'element' },
    {
      type,
      clear,
    }
  )
}
